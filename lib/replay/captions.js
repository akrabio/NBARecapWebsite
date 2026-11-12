// Hebrew caption templates for replay highlights (R18).
//
// Pure and deterministic, no React. `captionFor(highlight, ctx)` returns a
// structured plain-text caption:
//
//   { type, text, parts: [{ t, value, dir?, isolate?, playerId?, teamId? }] }
//
// - `text` is `parts.map(p => p.value).join("")` (for aria-labels / tests).
// - Part kinds: `text` (Hebrew copy), `player`, `team`, `score`, `clock`,
//   `number`. Every non-text part has `isolate: true` so the UI renders it in
//   its own `<bdi>` (names: `dir: "auto"`; scores, clocks and numbers:
//   `dir: "ltr"`), keeping "104–104", "8.2" and English names readable inside
//   RTL copy. Values are plain strings — never HTML. The UI MUST render every
//   part as a React text node (never dangerouslySetInnerHTML / innerHTML);
//   source strings are additionally stripped of bidi controls and "<" ">".
//
// Evidence rules
// - Only `highlight.captionParams` (already capability-filtered by W08), the
//   highlight `type` and, for `lead_change`, the past-only `evidence.lastLed`
//   (did the team lead earlier → "מחזיר את היתרון") are read. Never
//   `evidence.verification` (look-ahead facts).
// - A player is named only when the template's own param names them and the
//   id resolves in `ctx.players`; otherwise the team-level variant is used.
//   Secondary ids that W08 does not capability-check (`turnoverPlayerId`,
//   `shooterId`, `blockerId`) are never named.
// - Chronology: `missed_final_attempt` says only that the shot could have tied
//   or decided the game — no overtime, no result. `overtime` / `game_end`
//   announce the outcome at the confirmed boundary.
// - No motives, emotions or records beyond the params (e.g. a lead milestone
//   states the lead, not "largest of the season").
//
// ctx: `{ teams: { home, away }, players: Player[] | Map | Record<id, Player>,
//   format?: { regulationPeriods }, teamName?(team) → string,
//   playerName?(player) → string }` — `normalizeGame(...)` output works as is.

import { nbaEnToHe, nbaShortHe } from "../../utils/consts.js";
import { HIGHLIGHT_TYPES as T } from "./highlights.js";

/** Soft length budget for caption text (characters). */
export const CAPTION_MAX_LENGTH = 66; // longest fixture caption: 65 (first_lead_since with an ordinal period)

const DEFAULT_REG = 4;
const EN_DASH = "–";
// Bidi controls / C0–C1 controls would break isolation; strip them from source strings.
const UNSAFE_CHARS = /[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;
const HEBREW = /[\u0590-\u05ff]/;

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
// Defense in depth: "<" / ">" are also removed, although the UI must render parts as text nodes anyway.
const clean = (s) => (typeof s === "string" ? s.replace(UNSAFE_CHARS, "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim() : "");

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/** "104–104" (first value first; always rendered LTR). Null when either side is missing. */
export function formatScore(first, second) {
  if (!isNum(first) || !isNum(second)) return null;
  return `${first}${EN_DASH}${second}`;
}

/** Clock value without unit: "M:SS" at/above a minute, decimal seconds below ("8.2"). */
function clockValue(sec) {
  if (!isNum(sec) || sec < 0) return null;
  if (sec >= 60) {
    const whole = Math.floor(sec);
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
  }
  return (Math.floor(sec * 10) / 10).toFixed(1);
}

/** "4:06" above a minute, "8.2 שנ׳" below a minute; null when unknown. */
export function formatClock(sec) {
  const v = clockValue(sec);
  if (v == null) return null;
  return sec >= 60 ? v : `${v} שנ׳`;
}

/** "רבע 1"…"רבע 4", then "הארכה", "הארכה 2", … */
export function periodLabel(period, regulationPeriods = DEFAULT_REG) {
  if (!Number.isInteger(period) || period < 1) return null;
  const reg = Number.isInteger(regulationPeriods) && regulationPeriods > 0 ? regulationPeriods : DEFAULT_REG;
  if (period <= reg) return `רבע ${period}`;
  const ot = period - reg;
  return ot === 1 ? "הארכה" : `הארכה ${ot}`;
}

const ORDINAL_M = ["הראשון", "השני", "השלישי", "הרביעי"];
const ORDINAL_F = ["", "שנייה", "שלישית", "רביעית", "חמישית", "שישית"];

/**
 * Definite period phrase: "הרבע השני", "ההארכה", "ההארכה השנייה" (definite)
 * or "הארכה שנייה" (indefinite, overtime only). Null when unknown.
 */
function periodPhrase(period, reg, definite = true) {
  if (!Number.isInteger(period) || period < 1) return null;
  if (period <= reg) return ORDINAL_M[period - 1] ? `הרבע ${ORDINAL_M[period - 1]}` : `רבע ${period}`;
  const ot = period - reg;
  if (ot === 1) return definite ? "ההארכה" : "הארכה";
  const ord = ORDINAL_F[ot - 1];
  if (!ord) return definite ? `הארכה ${ot}` : `הארכה ${ot}`;
  return definite ? `ההארכה ה${ord}` : `הארכה ${ord}`;
}

// ---------------------------------------------------------------------------
// Part builders
// ---------------------------------------------------------------------------

const text = (value) => ({ t: "text", value });
const num = (n) => ({ t: "number", value: String(n), dir: "ltr", isolate: true });

function findPlayer(players, id) {
  if (!players || id == null) return null;
  if (players instanceof Map) return players.get(id) ?? null;
  if (Array.isArray(players)) return players.find((p) => p?.id === id) ?? null;
  return players[id] ?? null;
}

function makeResolver(ctx = {}) {
  const teams = ctx.teams ?? {};
  const reg = ctx.format?.regulationPeriods ?? ctx.regulationPeriods ?? DEFAULT_REG;
  const teamById = (id) => [teams.home, teams.away].find((t) => t && t.id != null && String(t.id) === String(id)) ?? null;

  const playerName = (id) => {
    const p = findPlayer(ctx.players, id);
    if (!p) return null;
    const name = clean(ctx.playerName ? ctx.playerName(p) : (p.shortName ?? p.name));
    return name || null;
  };
  const teamName = (id) => {
    const t = teamById(id);
    if (!t) return null;
    const custom = ctx.teamName ? clean(ctx.teamName(t)) : "";
    return custom || clean(nbaShortHe[t.name] ?? nbaEnToHe[t.name] ?? t.shortName ?? t.name ?? t.abbreviation ?? "") || null;
  };

  const player = (id) => {
    const value = playerName(id);
    return value ? { t: "player", value, dir: "auto", isolate: true, playerId: String(id) } : null;
  };

  /**
   * Team reference with a Hebrew prefix: "def" → "הנטס", "le" → "לנטס",
   * "et" → "את הנטס", "shel" → "של הנטס", "none" → "נטס". Non-Hebrew or
   * digit-leading names take a maqaf ("ה-76'רס", "ל-Raptors") or no article.
   */
  const team = (id, kind = "none") => {
    const value = teamName(id);
    if (!value) return null;
    const heb = HEBREW.test(value);
    const sep = /^\d/.test(value) || !heb ? "-" : "";
    const article = heb ? `ה${sep}` : "";
    const prefix = { none: "", def: article, le: `ל${sep}`, et: `את ${article}`, shel: `של ${article}` }[kind] ?? "";
    const part = { t: "team", value, dir: "auto", isolate: true, teamId: String(id) };
    return prefix ? [text(prefix), part] : [part];
  };

  const sides = () => ({ home: teams.home?.id != null ? String(teams.home.id) : null, away: teams.away?.id != null ? String(teams.away.id) : null });

  /** Score with the given team's points first (default away–home). */
  const score = (params, firstTeamId) => {
    const { home, away } = sides();
    const h = params.scoreHome;
    const a = params.scoreAway;
    const value = firstTeamId != null && String(firstTeamId) === home ? formatScore(h, a) : firstTeamId != null && String(firstTeamId) === away ? formatScore(a, h) : formatScore(a, h);
    return value ? { t: "score", value, dir: "ltr", isolate: true } : null;
  };

  const clock = (sec) => {
    const value = clockValue(sec);
    return value ? { t: "clock", value, dir: "ltr", isolate: true } : null;
  };

  return { reg, player, team, score, clock, sides };
}

// ---------------------------------------------------------------------------
// Templates (one per highlight type; each returns body parts or null)
// ---------------------------------------------------------------------------

/** "בשלשה" / "מהקו" qualifier for a scoring action (only when evidenced). */
const shotQualifier = (p) => (p.action === "free_throw" ? " מהקו" : p.shotValue === 3 ? " בשלשה" : "");

const seq = (...xs) => xs.flat().filter(Boolean);

const TEMPLATES = {
  [T.TIE]: (p, r) => {
    const pl = r.player(p.playerId);
    if (pl) return seq(pl, text(` משווה${shotQualifier(p)}`));
    const tm = r.team(p.teamId, "def");
    return tm ? seq(tm, text(` משווים${shotQualifier(p)}`)) : seq(text("שוויון"));
  },
  [T.GO_AHEAD]: (p, r) => {
    const pl = r.player(p.playerId);
    if (pl) return seq(pl, text(" מעלה "), r.team(p.teamId, "et") ?? text("את קבוצתו"), text(` ליתרון${shotQualifier(p)}`));
    const tm = r.team(p.teamId, "def");
    return tm ? seq(tm, text(` עולים ליתרון${shotQualifier(p)}`)) : seq(text("עלייה ליתרון"));
  },
  [T.LEAD_CHANGE]: (p, r, ev) => {
    // "Returns the lead" only with non-look-ahead evidence that the team led earlier.
    const ledEarlier = ev?.lastLed != null && typeof ev.lastLed === "object";
    if (!ledEarlier) return TEMPLATES[T.GO_AHEAD](p, r);
    const pl = r.player(p.playerId);
    if (pl) return seq(pl, text(" מחזיר את היתרון "), r.team(p.teamId, "le") ?? text("לקבוצתו"), text(shotQualifier(p)));
    const tm = r.team(p.teamId, "def");
    return tm ? seq(tm, text(` חוזרים ליתרון${shotQualifier(p)}`)) : seq(text("חזרה ליתרון"));
  },
  [T.FIRST_LEAD_SINCE]: (p, r) => {
    const since = sinceParts(p, r);
    if (!since) return TEMPLATES[T.GO_AHEAD](p, r); // no span to cite → plain go-ahead wording
    const pl = r.player(p.playerId);
    if (pl) return seq(pl, text(" מעלה "), r.team(p.teamId, "et") ?? text("את קבוצתו"), text(" ליתרון ראשון מאז "), since);
    const tm = r.team(p.teamId, "le");
    return tm ? seq(text("יתרון ראשון "), tm, text(" מאז "), since) : seq(text("יתרון ראשון מאז "), since);
  },
  [T.FIRST_LEAD]: (p, r) => {
    const pl = r.player(p.playerId);
    if (pl) return seq(pl, text(" מעלה "), r.team(p.teamId, "et") ?? text("את קבוצתו"), text(" ליתרון ראשון במשחק"));
    const tm = r.team(p.teamId, "le");
    return tm ? seq(text("יתרון ראשון במשחק "), tm) : seq(text("יתרון ראשון במשחק"));
  },
  [T.BIG_SHOT]: (p, r) => {
    const three = p.shotValue === 3;
    const pl = r.player(p.playerId);
    if (pl) return three ? seq(pl, text(" קולע שלשה")) : seq(text("סל של "), pl);
    if (three) {
      const tm = r.team(p.teamId, "def");
      return tm ? seq(tm, text(" קולעים שלשה")) : seq(text("שלשה"));
    }
    const tm = r.team(p.teamId, "shel");
    return tm ? seq(text("סל "), tm) : seq(text("סל"));
  },
  [T.STEAL]: (p, r) => {
    const pl = r.player(p.playerId);
    const scored = p.followedBy === "score";
    if (pl) {
      if (scored && p.scorerId != null && String(p.scorerId) === String(p.playerId)) return seq(text("חטיפה וסל של "), pl);
      const scorer = scored && p.scorerId != null ? r.player(p.scorerId) : null;
      if (scorer) return seq(text("חטיפה של "), pl, text(" וסל של "), scorer);
      if (scored) return seq(text("חטיפה של "), pl, text(" וסל בהתקפה הבאה"));
      return seq(text("חטיפה של "), pl);
    }
    const tm = r.team(p.teamId, "shel");
    return seq(text("חטיפה "), tm ?? [], scored ? text(" וסל בהתקפה הבאה") : null);
  },
  [T.TURNOVER]: (p, r) => {
    const pl = r.player(p.playerId);
    if (pl) return seq(text("איבוד כדור של "), pl);
    const tm = r.team(p.teamId, "shel");
    return tm ? seq(text("איבוד כדור "), tm) : seq(text("איבוד כדור"));
  },
  [T.BLOCK]: (p, r) => {
    const shot = p.shotValue === 3 ? "שלשה" : "זריקה";
    const could = { tie: "שיכלה להשוות", go_ahead: "שיכלה לתת יתרון", extend: "שיכלה להגדיל את הפער" }[p.stake];
    const pl = r.player(p.playerId);
    const subject = pl ? seq(pl, text(" חוסם")) : r.team(p.teamId, "def") ? seq(r.team(p.teamId, "def"), text(" חוסמים")) : seq(text("חסימה"));
    return could ? seq(subject, text(` ${shot} ${could}`)) : pl ? seq(text("חסימה של "), pl) : subject;
  },
  [T.MISSED_FINAL_ATTEMPT]: (p, r) => {
    // Chronology-safe: the stake of the shot only. Never the result / overtime.
    const shot = p.shotValue === 3 ? "שלשה" : "זריקה";
    const could = { tie: "שיכלה להשוות", win: "שיכלה להכריע" }[p.stake] ?? null;
    const pl = r.player(p.playerId);
    const tail = text(could ? ` ${shot} ${could}` : ` ${shot}`);
    if (pl) return seq(pl, text(" מחטיא"), tail);
    const tm = r.team(p.teamId, "def");
    return tm ? seq(tm, text(" מחטיאים"), tail) : seq(text("החטאה"), tail);
  },
  [T.FOUL_OUT]: (p, r) => {
    const fouls = isNum(p.fouls) ? p.fouls : null;
    const pl = r.player(p.playerId);
    if (pl) return fouls === 6 ? seq(pl, text(" נפסל בעבירה השישית")) : fouls ? seq(pl, text(" נפסל ב-"), num(fouls), text(" עבירות")) : seq(pl, text(" נפסל בעבירות"));
    const tm = r.team(p.teamId, "shel");
    return seq(text("שחקן "), tm ?? [], text(" נפסל בעבירות"));
  },
  [T.LEAD_MILESTONE]: (p, r) => {
    const lead = isNum(p.lead) ? p.lead : isNum(p.threshold) ? p.threshold : null;
    if (lead == null) return null;
    const pl = r.player(p.playerId);
    if (pl) return seq(pl, text(" מעלה "), r.team(p.teamId, "et") ?? text("את קבוצתו"), text(" ליתרון של "), num(lead));
    const tm = r.team(p.teamId, "def");
    return tm ? seq(tm, text(" ביתרון של "), num(lead)) : seq(text("יתרון של "), num(lead));
  },
  [T.OVERTIME]: (p, r) => {
    // Confirmed period boundary: announcing overtime is allowed here.
    const s = r.score(p);
    const ended = Number.isInteger(p.endedPeriod) ? p.endedPeriod : null;
    const next = periodPhrase(p.nextPeriod, r.reg, false) ?? "הארכה";
    const endedLabel = ended == null ? null : ended <= r.reg ? "הזמן החוקי" : periodPhrase(ended, r.reg, true);
    return seq(text("שוויון "), s, endedLabel ? text(` בסיום ${endedLabel}`) : null, text(` — יוצאים ל${next}`));
  },
  [T.GAME_END]: (p, r) => {
    const tm = r.team(p.winnerTeamId, "le");
    const s = r.score(p, p.winnerTeamId);
    return seq(text("סיום: ניצחון "), tm ?? [], s ? text(" ") : null, s);
  },
};

/** "הרבע השני" / "ההארכה" or, within the same period, "8:45 ברבע הרביעי". Null without evidence. */
function sinceParts(p, r) {
  if (!Number.isInteger(p.sincePeriod)) return null;
  const phrase = periodPhrase(p.sincePeriod, r.reg, true);
  if (!phrase) return null;
  if (p.sincePeriod === p.period) {
    const c = r.clock(p.sinceClockSec);
    return c ? seq(c, text(` ב${phrase.replace(/^ה/, "")}`)) : null;
  }
  return seq(text(phrase));
}

/** Types whose caption ends with the score after the moment (subject team first). */
const SCORE_SUFFIX = new Set([T.TIE, T.GO_AHEAD, T.LEAD_CHANGE, T.FIRST_LEAD_SINCE, T.FIRST_LEAD, T.BIG_SHOT, T.STEAL, T.TURNOVER, T.BLOCK, T.MISSED_FINAL_ATTEMPT, T.LEAD_MILESTONE]);
/** Types that may append the remaining clock (final period/OT, under a minute). */
// "First lead since…" captions are already long and about the drought, not the clock: no clock suffix.
const CLOCK_SUFFIX = new Set([...[...SCORE_SUFFIX].filter((t) => t !== T.FIRST_LEAD_SINCE && t !== T.FIRST_LEAD), T.FOUL_OUT]);

/** Highlight types with a caption template. */
export const CAPTION_TYPES = Object.freeze(Object.keys(TEMPLATES));

/**
 * Build the caption for a highlight record. Returns null for an unknown type
 * or a template with nothing evidenced to say.
 */
export function captionFor(highlight, ctx = {}) {
  const type = highlight?.type;
  const template = TEMPLATES[type];
  if (!template) return null;
  const p = highlight.captionParams && typeof highlight.captionParams === "object" ? highlight.captionParams : {};
  const r = makeResolver(ctx);
  // Only the non-look-ahead `lastLed` fact is passed on; `evidence.verification` is never touched.
  const lastLed = type === T.LEAD_CHANGE ? highlight.evidence?.lastLed : undefined;
  const body = template(p, r, { lastLed });
  if (!body || body.length === 0) return null;
  const parts = [...body];
  if (SCORE_SUFFIX.has(type)) {
    const s = r.score(p, p.teamId);
    if (s) parts.push(text(" — "), s);
  }
  if (CLOCK_SUFFIX.has(type) && isNum(p.clockSec) && p.clockSec < 60 && Number.isInteger(p.period) && p.period >= r.reg) {
    const c = r.clock(p.clockSec);
    if (c) parts.push(text(parts.some((x) => x.t === "score") ? ", " : " — "), c, text(" שנ׳ לסיום"));
  }
  const merged = mergeText(parts);
  return { type, text: merged.map((x) => x.value).join(""), parts: merged };
}

/** Merge adjacent text parts; drop empty ones. */
function mergeText(parts) {
  const out = [];
  for (const x of parts) {
    if (!x || x.value == null || x.value === "") continue;
    const last = out[out.length - 1];
    if (x.t === "text" && last?.t === "text") last.value += x.value;
    else out.push({ ...x });
  }
  return out;
}
