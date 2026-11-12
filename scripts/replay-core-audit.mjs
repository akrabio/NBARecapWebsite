#!/usr/bin/env node
// Replay core acceptance audit (task R24, Gate C).
//
// Usage:
//   node scripts/replay-core-audit.mjs [fixtureId…]          # writes docs/replay-implementation/core-audit.md
//   node scripts/replay-core-audit.mjs --stdout [fixtureId…]
//   node scripts/replay-core-audit.mjs --check [fixtureId…]   # no write; exit 1 if client ≠ server
//
// Reads tests/fixtures/replay/*.json (manifest.json). Never fetches. For each
// fixture: builds the API body with `buildReplay`, reports status/reasons,
// reconciliation, lineup gaps, selected moments (evidence summary + caption),
// duration, holds, payload size (raw/gzip) and build time; then compares the
// browser-side `replayStateAt(payload)` (payload round-tripped through JSON)
// against an independent SEQUENTIAL server walk (`stepState` from the initial
// state, no checkpoints) at -1, the end and ≥200 seeded-random positions; and
// records explicit inspections of a substitution, block, steal, late miss and
// overtime transition.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { isDeepStrictEqual } from "node:util";
import { buildReplay } from "../lib/replay/build.js";
import { replayStateAt } from "../lib/replay/client-state.js";
import { buildHighlights } from "../lib/replay/highlights.js";
import { normalizeGame } from "../lib/replay/normalize.js";
import { buildStateIndex, initialState, stateContext, stepState } from "../lib/replay/state.js";
import { EVENT_KINDS as K } from "../lib/replay/types.js";
import { validateReplay } from "../lib/replay/validate.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_DIR = join(ROOT, "tests/fixtures/replay");
const OUT = join(ROOT, "docs/replay-implementation/core-audit.md");
const args = process.argv.slice(2);
const toStdout = args.includes("--stdout");
const checkOnly = args.includes("--check"); // no write; exit 1 on any client≠server mismatch
const manifest = JSON.parse(readFileSync(join(FIXTURE_DIR, "manifest.json"), "utf8"));
const ids = args.filter((a) => !a.startsWith("--"));
const fixtureIds = ids.length ? ids : Object.keys(manifest.fixtures);
const SAMPLES = 240;
const BUILD_RUNS = 7;

const lines = [];
const out = (s = "") => lines.push(s);
const f1 = (x) => x.toFixed(1);
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
const clock = (sec) => (sec == null ? "?" : sec >= 60 ? `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}` : sec.toFixed(1));
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sequentialStates(n) {
  const ctx = stateContext(n);
  const states = [initialState(n, ctx).state];
  for (const e of n.events) states.push(stepState(states[states.length - 1], e, ctx).state);
  return (i) => states[i + 1]; // i = -1..last
}

function evidenceSummary(ev = {}) {
  const bits = [];
  if (ev.scoreBefore && ev.scoreAfter) bits.push(`score ${ev.scoreBefore.away}–${ev.scoreBefore.home} → ${ev.scoreAfter.away}–${ev.scoreAfter.home}`);
  if (ev.probability) bits.push(`home WP ${ev.probability.homeBefore ?? "?"} → ${ev.probability.homeAfter ?? "?"}`);
  for (const k of ["points", "runPoints", "maxDeficitSinceLead", "lead", "margin", "droughtSec", "fouls", "stealerId", "blockerId", "attemptValue"]) {
    if (ev[k] != null && typeof ev[k] !== "object") bits.push(`${k} ${ev[k]}`);
  }
  if (ev.lastLed) bits.push(`last led P${ev.lastLed.period} ${clock(ev.lastLed.clockSec)}`);
  if (ev.unit) bits.push(`events ${ev.unit.from}–${ev.unit.to}`);
  return bits.join("; ");
}

const nameOf = (n, id) => n.players.find((p) => p.id === id)?.shortName ?? id;
const pl = (n, e) => (e.period <= n.format.regulationPeriods ? `Q${e.period}` : `OT${e.period - n.format.regulationPeriods}`);
const scoreStr = (s) => `${s.away}–${s.home}`;

const summary = [];
const sections = [];
const inspections = [];
let totalMismatches = 0;
let totalSamples = 0;

for (const id of fixtureIds) {
  const text = readFileSync(join(FIXTURE_DIR, `${id}.json`), "utf8");
  const times = [];
  let result;
  for (let r = 0; r < BUILD_RUNS; r++) {
    const summaryJson = JSON.parse(text);
    const t0 = performance.now();
    result = buildReplay(summaryJson);
    times.push(performance.now() - t0);
  }
  const json = JSON.stringify(result);
  const deterministic = JSON.stringify(buildReplay(JSON.parse(text))) === json;
  const gz = gzipSync(json).length;
  const replay = JSON.parse(json).replay; // what the browser receives

  const n = normalizeGame(JSON.parse(text));
  const idx = buildStateIndex(n);
  const v = validateReplay(n, idx);
  const { highlights } = buildHighlights(n, { stateIndex: idx, capabilities: v.capabilities });
  const evidenceById = new Map(highlights.map((h) => [h.id, h.evidence]));
  const seq = sequentialStates(n);
  const last = n.events.length - 1;
  const fin = n.events[last].scoreAfter;
  const title = `${n.teams.away.abbreviation}@${n.teams.home.abbreviation} ${fin.away}–${fin.home}`;

  // --- Random-position comparison ---------------------------------------------
  const rand = rng(Number(id.slice(-4)));
  const positions = [-1, 0, last, ...Array.from({ length: SAMPLES }, () => Math.floor(rand() * (last + 2)) - 1)];
  let mismatches = 0;
  let worstMs = 0;
  for (const i of positions) {
    const t0 = performance.now();
    const client = replayStateAt(replay, i);
    worstMs = Math.max(worstMs, performance.now() - t0);
    if (!isDeepStrictEqual(client, seq(i)) || !isDeepStrictEqual(client, idx.stateAt(i))) mismatches++;
  }
  totalMismatches += mismatches;
  totalSamples += positions.length;

  const holds = replay ? replay.timeline.segments.filter((s) => s.kind === "hold").length : 0;
  const rec = v.reconciliation;
  const teamMismatch = Object.values(rec.teams).flatMap((t) => Object.entries(t.counters).filter(([, c]) => c.match === false).map(([k]) => `${t.abbreviation} ${k}`));
  const gaps = Object.values(v.lineups).map((t) => `${t.abbreviation}: ${t.validStates}/${t.totalStates} valid, ${t.fallbackIntervals.length} fallback intervals, actor violations ${t.evidence.actorViolations}/${t.evidence.actorChecks}, final five = box active: ${t.evidence.finalMatchesActive}`);
  const sizes = replay ? Object.fromEntries(Object.keys(replay).map((k) => [k, JSON.stringify(replay[k]).length])) : {};

  summary.push(`| ${id} | ${title} | ${result.status} | ${result.reasons.join(", ") || "—"} | ${replay ? f1(replay.durationSec) : "—"} | ${replay?.highlights.length ?? 0} | ${holds} | ${kb(json.length)} | ${kb(gz)} | ${f1(median(times))} ms | ${mismatches}/${positions.length} | ${deterministic ? "yes" : "NO"} |`);

  const s = [];
  s.push(`## ${id} — ${title}`);
  s.push("");
  s.push(`- Status **${result.status}**${result.reasons.length ? ` (${result.reasons.join(", ")})` : ""}; warnings: ${result.warnings.map((w) => `${w.code}×${w.count}`).join(", ") || "none"}.`);
  s.push(`- Score: final ${rec.score.final.away.source}–${rec.score.final.home.source} (credited ${rec.score.final.away.credited}–${rec.score.final.home.credited}, header ${rec.score.final.away.expected}–${rec.score.final.home.expected}); ${rec.score.periods.filter((p) => p.match).length}/${rec.score.periods.length} periods match.`);
  s.push(`- Players: ${rec.players.matched}/${rec.players.checked} counter values reconcile${rec.players.mismatches.length ? `; mismatches: ${rec.players.mismatches.map((m) => `${m.name} ${m.counter} ${m.reconstructed} vs box ${m.expected}`).join("; ")}` : ""}${rec.players.unattributed.length ? `; unattributed: ${rec.players.unattributed.map((u) => `${u.teamId} ${u.counter} ${u.amount}`).join(", ")}` : ""}. Team totals not reconciling: ${teamMismatch.join(", ") || "none"}.`);
  s.push(`- Non-reliable capabilities: ${result.capabilities.filter((c) => c.level !== "reliable").map((c) => `${c.family}/${c.scope}=${c.level}${c.players ? ` [${c.players.map((p) => nameOf(n, p)).join(", ")}]` : ""}${c.teams ? ` [team ${c.teams.join(", ")}]` : ""}`).join("; ") || "none"}.`);
  s.push(`- Lineups: ${gaps.join(" · ")}.`);
  s.push(`- Probability: ${v.probability.level}, ${v.probability.samples}/${v.probability.events} events linked.`);
  s.push(`- Duration ${replay ? f1(replay.durationSec) : "—"} s, ${holds} holds; payload ${kb(json.length)} raw / ${kb(gz)} gzip (${Object.entries(sizes).map(([k, b]) => `${k} ${kb(b)}`).join(", ")}); build median ${f1(median(times))} ms (min ${f1(Math.min(...times))}, ${BUILD_RUNS} runs); deterministic: ${deterministic}.`);
  s.push(`- Client state check: ${positions.length} positions (-1, 0, end + ${SAMPLES} random), ${mismatches} mismatches vs sequential walk and server stateAt; slowest client lookup ${worstMs.toFixed(2)} ms (first call includes the one-time checkpoint pass).`);
  s.push("");
  if (replay?.highlights.length) {
    s.push("| Moment | Type | Clock | Score | Evidence (look-back) | Caption |");
    s.push("| --- | --- | --- | --- | --- | --- |");
    for (const h of replay.highlights) {
      const e = n.events[h.eventIndex];
      s.push(`| ${h.id} | ${h.type} | ${pl(n, e)} ${clock(e.clockRemainingSec)} | ${scoreStr(e.scoreAfter)} | ${evidenceSummary(evidenceById.get(h.id))} | ${h.caption?.text ?? "—"} |`);
    }
    s.push("");
  }
  sections.push(...s);

  // --- Explicit inspections ---------------------------------------------------
  const at = (i) => replayStateAt(replay, i);
  const eqSeq = (i) => isDeepStrictEqual(at(i), seq(i));
  const inspect = (label, i, describe) => inspections.push(`- **${label}** — ${id} #${i} ${pl(n, n.events[i])} ${clock(n.events[i].clockRemainingSec)}: ${describe(at(i - 1), at(i), n.events[i])} Client = sequential: ${eqSeq(i - 1) && eqSeq(i)}.`);
  const counter = (st, pid, k) => st.players[pid][k];

  if (id === "401810791") {
    // Substitution group (multi-sub, mid-game).
    const groups = new Map();
    n.events.forEach((e) => e.kind === K.SUBSTITUTION && e.substitutionGroup != null && groups.set(e.substitutionGroup, [...(groups.get(e.substitutionGroup) ?? []), e.index]));
    const g = [...groups.values()].find((xs) => xs.length >= 2 && n.events[xs[0]].period === 2);
    if (g) {
      const first = g[0];
      const endI = g[g.length - 1];
      const team = n.events[first].teamId;
      const before = at(first - 1).lineups.teams[team].onCourt;
      const mid = at(first);
      const after = at(endI).lineups.teams[team].onCourt;
      const subs = g.map((i) => `${nameOf(n, n.events[i].roles.entering)} for ${nameOf(n, n.events[i].roles.leaving)}`).join(", ");
      inspections.push(`- **Substitution group** — ${id} #${first}–#${endI} ${pl(n, n.events[first])} ${clock(n.events[first].clockRemainingSec)} (team ${team}): ${subs}. Before: [${before.map((p) => nameOf(n, p)).join(", ")}]; after first sub the five is unchanged (${isDeepStrictEqual(mid.lineups.teams[team].onCourt, before)}) with pendingSubs [${mid.lineups.pendingSubs.join(", ")}]; after the group: [${after.map((p) => nameOf(n, p)).join(", ")}], valid ${at(endI).lineups.teams[team].valid}, pendingSubs [${at(endI).lineups.pendingSubs.join(", ")}]. Client = sequential: ${g.every(eqSeq) && eqSeq(first - 1)}.`);
    }
    // Steal.
    const st = n.events.find((e) => e.kind === K.TURNOVER && e.roles.stealer && e.period === 3);
    if (st) inspect("Steal", st.index, (a, b, e) => `${nameOf(n, e.roles.stealer)} stl ${counter(a, e.roles.stealer, "stl")} → ${counter(b, e.roles.stealer, "stl")}; ${nameOf(n, e.roles.turnoverBy)} to ${counter(a, e.roles.turnoverBy, "to")} → ${counter(b, e.roles.turnoverBy, "to")}; score unchanged ${scoreStr(a.score)} = ${scoreStr(b.score)}.`);
  }
  if (id === "401810062") {
    // Block, and the known bad block (role dropped → unattributed).
    const blk = n.events.find((e) => e.kind === K.FIELD_GOAL && e.roles.blocker && e.period === 2);
    if (blk) inspect("Block", blk.index, (a, b, e) => `${nameOf(n, e.roles.blocker)} blk ${counter(a, e.roles.blocker, "blk")} → ${counter(b, e.roles.blocker, "blk")}; shooter ${nameOf(n, e.roles.shooter)} fga ${counter(a, e.roles.shooter, "fga")} → ${counter(b, e.roles.shooter, "fga")}, fgm unchanged ${counter(b, e.roles.shooter, "fgm")}.`);
    const bad = n.events.find((e) => e.sourcePlayId === "401810062656");
    if (bad) inspect("Unverified block (source conflict)", bad.index, (a, b, e) => `no blocker role (${e.issues.map((x) => x.code).join(", ")}); team ${e.teamId === n.teams.home.id ? n.teams.away.id : n.teams.home.id} unattributed blk ${JSON.stringify(a.unattributed)} → ${JSON.stringify(b.unattributed)}; Porter Jr. blk stays ${counter(b, "4278104", "blk")} and his blk capability is unavailable.`);
  }
  if (id === "401810798") {
    // Late miss: last missed field goal in the final 30 s of regulation.
    const miss = [...n.events].reverse().find((e) => e.kind === K.FIELD_GOAL && e.detail.made === false && e.period === n.format.regulationPeriods && e.clockRemainingSec <= 30 && e.roles.shooter);
    if (miss) inspect("Late miss", miss.index, (a, b, e) => `${nameOf(n, e.roles.shooter)} misses (${e.text}); fga ${counter(a, e.roles.shooter, "fga")} → ${counter(b, e.roles.shooter, "fga")}${e.detail.heave ? " (heave: excluded from FGA/3PA by the box-score rule)" : ""}, fgm ${counter(a, e.roles.shooter, "fgm")} → ${counter(b, e.roles.shooter, "fgm")}, score ${scoreStr(a.score)} → ${scoreStr(b.score)}; highlight ${replay.highlights.find((h) => h.keyEventIndex === e.index || (h.groupStartIndex <= e.index && e.index <= h.groupEndIndex))?.id ?? "none"}.`);
  }
  if (id === "401810798") {
    // Overtime transition: end of Q4 → first OT event.
    const end4 = n.events.find((e) => e.kind === K.PERIOD_END && e.period === n.format.regulationPeriods);
    const ot = n.events[end4.index + 1];
    const frameEnd = replay.timeline.periods.find((p) => p.period === n.format.regulationPeriods);
    const frameOt = replay.timeline.periods.find((p) => p.period === n.format.regulationPeriods + 1);
    const otHold = replay.highlights.find((h) => h.type === "overtime");
    inspections.push(`- **Overtime transition** — ${id} #${end4.index} (end of Q4, ${scoreStr(at(end4.index).score)}) → #${ot.index} ${pl(n, ot)} ${clock(ot.clockRemainingSec)} (${ot.kind}). Client period/clock: ${replay.events[end4.index].period} ${replay.events[end4.index].clock} → ${replay.events[ot.index].period} ${replay.events[ot.index].clock}; timeline Q4 ends at ${f1(frameEnd.endSec)} s, OT1 starts at ${f1(frameOt.startSec)} s (label ${frameOt.label}); overtime hold ${otHold ? `${otHold.id} at #${otHold.eventIndex}: “${otHold.caption?.text}”` : "none"}; lineups valid on both sides at OT start: ${Object.values(at(ot.index).lineups.teams).every((t) => t.valid)}. Client = sequential: ${eqSeq(end4.index) && eqSeq(ot.index)}.`);
  }
}

out("# Replay core audit (R24, Gate C)");
out();
out("Generated by `node scripts/replay-core-audit.mjs` from the committed fixtures with `lib/replay/build.js` defaults. Scores away–home. Payload = `JSON.stringify(buildReplay(summary))`; gzip = Node zlib default level. Build time = median wall time of `buildReplay` on a laptop (input already parsed). Client-state check: payload round-tripped through JSON, `replayStateAt` (lib/replay/client-state.js) vs an independent sequential `stepState` walk and server `stateAt`, deep-strict equality.");
out();
out("| Game | Matchup | Status | Reasons | Duration s | Moments | Holds | Raw | Gzip | Build | Client≠server | Deterministic |");
out("| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |");
for (const r of summary) out(r);
out();
out(`Total: ${totalMismatches} client/server mismatches over ${totalSamples} sampled positions.`);
out();
out("## Explicit inspections");
out();
for (const l of inspections) out(l);
out();
out("## Remaining source limits");
out();
out("- 401810062: Porter Jr. block (play 401810062656) — participant contradicts text/box; blk unavailable for him, team blk total reconciles via `unattributed`.");
out("- 401810792: Holland II 3PA 6 (pbp) vs 5 (box) — unexplained source inconsistency; his 3PT unavailable, DET 3PT team total limited.");
out("- Not observed in the corpus (rules untested on real data): ejections, stat corrections, reviews requiring reversal, multi-OT, playoff games, missing/partial win probability (covered by synthetic tests only).");
out("- Pacing is not approved by this gate; viewing trials follow the UI (W20).");
out();
for (const l of sections) out(l);

const doc = lines.join("\n") + "\n";
if (checkOnly) console.log(`check: ${totalMismatches} client/server mismatches over ${totalSamples} positions`);
else if (toStdout) process.stdout.write(doc);
else {
  writeFileSync(OUT, doc);
  console.log(`wrote ${OUT}`);
}
if (totalMismatches) process.exitCode = 1;
