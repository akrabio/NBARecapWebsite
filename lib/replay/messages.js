// Reader-facing replay state messages and data-limit summaries (task R39),
// plus the accessible moment history and announcement pacing (task R40).
// Browser-safe and pure; the only import is display.js (itself import-free),
// so the client bundle never pulls in the server-side builder/validator.
//
// - REASON_MESSAGES: one short Hebrew explanation per server REASON_CODE
//   (lib/replay/types.js — copied here as plain strings so this module stays
//   import-free; tests assert the two lists match) and per client reason
//   (utils/replay-api.js CLIENT_REASONS). Unknown codes fall back to
//   GENERIC_UNAVAILABLE. Most limited/informational codes never reach the
//   reader as a whole-replay reason; they still have explicit text so a future
//   classification change can never surface a raw code.
// - capabilityGaps: what the reader will NOT see during this replay, derived
//   only from the payload's capabilities (never from `game.story`, never from
//   final totals): unavailable stat families (game / player / team scope),
//   lineup fallback and missing win probability.
// - reachedMoments: the moments whose hold has started by a replay second —
//   never a future moment (same rule as timeline.js spotlightAt).
// - announceDelay: rate limit for the single polite live region.

import { familyAvailable, hePeriodLabel, probabilityAvailable } from "./display.js";

/** Whole-replay unavailability, by reason code (first known reason wins). */
export const REASON_MESSAGES = Object.freeze({
  // Unavailable (whole replay)
  game_not_final: "השחזור יהיה זמין לאחר סיום המשחק.",
  no_plays: "אין למשחק הזה נתוני מהלכים (play-by-play), ולכן אי אפשר לשחזר אותו.",
  no_boxscore: "חסרים נתוני הסטטיסטיקה הסופית של המשחק, ולכן אי אפשר לאמת את השחזור.",
  missing_teams: "חסרים פרטי הקבוצות במקור הנתונים.",
  score_coverage_gap: "נתוני המהלכים אינם מגיעים עד התוצאה הסופית — חלק מהמשחק חסר.",
  score_regression: "נתוני המהלכים מכילים תוצאה שיורדת לאחור, ולכן אינם אמינים לשחזור.",
  unparseable_clock: "לא ניתן לקרוא את שעון המשחק בנתוני המהלכים.",
  // Limited (family-level)
  stat_mismatch: "חלק מהסטטיסטיקות לא תאמו את הסיכום הסופי ולכן הוסתרו.",
  unknown_athlete: "חלק מהמהלכים מיוחסים לשחקן שאינו בסגל המשחק.",
  role_text_conflict: "בחלק מהמהלכים זהות השחקן סותרת את תיאור המהלך.",
  role_unresolved: "בחלק מהמהלכים לא ניתן לזהות בוודאות את השחקן.",
  lineup_invalid: "לא ניתן לעקוב בוודאות אחר חמשת השחקנים על המגרש.",
  lineup_actor_off_court: "לא ניתן לעקוב בוודאות אחר חמשת השחקנים על המגרש.",
  lineup_sub_inconsistent: "נתוני החילופים אינם עקביים, ולכן ההרכב על המגרש אינו זמין.",
  lineup_no_starters: "חמישיית הפתיחה אינה ידועה, ולכן ההרכב על המגרש אינו זמין.",
  probability_missing: "אין נתוני סיכויי ניצחון למשחק הזה.",
  probability_unlinked: "נתוני סיכויי הניצחון אינם מקושרים למהלכים.",
  probability_out_of_range: "נתוני סיכויי הניצחון אינם תקינים.",
  probability_conflict: "נתוני סיכויי הניצחון סותרים זה את זה.",
  // Informational warnings
  sequence_out_of_order: "סדר המהלכים במקור אינו רציף.",
  identical_records: "במקור יש מהלכים כפולים לכאורה.",
  heave_excluded: "זריקות מחצי מגרש בסיום רבע אינן נספרות בניסיונות.",
  unknown_event_type: "חלק מהמהלכים מסוג לא מוכר.",
  // Normalization issues
  role_team_conflict: "בחלק מהמהלכים השחקן משויך לקבוצה הלא נכונה.",
  unknown_team: "חלק מהמהלכים משויכים לקבוצה שאינה משחקת במשחק.",
  invalid_period: "בחלק מהמהלכים חסר מספר הרבע.",
  invalid_score: "בחלק מהמהלכים חסרה התוצאה.",
  unknown_shot_value: "בחלק מהזריקות לא ידוע אם היו לשתיים או לשלוש.",
  duplicate_record: "מהלכים כפולים הוסרו מהנתונים.",
  duplicate_id_conflict: "במקור יש מהלכים סותרים עם אותו מזהה.",
  clock_fallback: "בחלק מהמהלכים שעון המשחק שוחזר מערך חלופי.",
  // Stat deltas
  attribution_unknown: "חלק מהסטטיסטיקות ידועות לקבוצה אך לא לשחקן מסוים.",
  score_delta_mismatch: "הניקוד בחלק מהמהלכים אינו תואם את שינוי התוצאה.",
  // Validation / quality classification
  period_score_mismatch: "הניקוד ברבעים אינו תואם את התוצאה הרשמית של כל רבע.",
  period_scores_missing: "התוצאות לפי רבעים אינן זמינות לאימות.",
  clock_coverage_gap: "ליותר מדי מהלכים אין שעון משחק, ולכן אי אפשר למקם אותם בזמן.",
  stat_unverifiable: "לחלק מהסטטיסטיקות אין סיכום סופי לאימות.",
  no_game_end: "נתוני המהלכים נקטעים לפני סיום המשחק.",
  no_final_period_end: "נתוני המהלכים נקטעים לפני סיום הרבע האחרון.",
  lineup_invariant: "מעקב ההרכב נשבר באמצע המשחק, ולכן ההרכב על המגרש אינו זמין.",
  // Builder
  input_too_large: "נתוני המשחק גדולים מכדי לעבד אותם לשחזור.",
  // Client (utils/replay-api.js CLIENT_REASONS)
  no_espn_id: "המשחק אינו מקושר לנתוני המהלכים של ESPN, ולכן אין לו שחזור.",
  invalid_id: "מזהה המשחק אינו תקין, ולכן אין לו שחזור.",
  unknown_event: "מקור הנתונים אינו מכיר את המשחק הזה.",
});

export const GENERIC_UNAVAILABLE = "אין מספיק נתונים אמינים כדי לשחזר את המשחק.";

/** Message for one reason code (generic fallback for unknown codes). */
export function reasonMessage(code) {
  return Object.hasOwn(REASON_MESSAGES, code) ? REASON_MESSAGES[code] : GENERIC_UNAVAILABLE;
}

/**
 * Unavailable-state copy for a reason list: `{ title, detail, reason }`.
 * `reason` = the first code with a dedicated message (null → generic).
 */
export function unavailableMessage(reasons) {
  const list = Array.isArray(reasons) ? reasons : [];
  const reason = list.find((r) => Object.hasOwn(REASON_MESSAGES, r)) ?? null;
  const title = reason === "game_not_final" ? "המשחק עדיין לא הסתיים" : "השחזור אינו זמין למשחק הזה";
  return { title, detail: reason ? REASON_MESSAGES[reason] : GENERIC_UNAVAILABLE, reason };
}

/** Temporary-failure copy by ReplayLoadError code (always retryable; never cached). */
export const ERROR_MESSAGES = Object.freeze({
  network: "לא הצלחנו להתחבר. בדקו את החיבור ונסו שוב.",
  upstream: "מקור הנתונים לא הגיב בזמן. נסו שוב בעוד רגע.",
  http: "השרת החזיר שגיאה. נסו שוב בעוד רגע.",
  bad_response: "התקבלו נתונים לא תקינים. נסו שוב בעוד רגע.",
});
export const GENERIC_ERROR = "אירעה תקלה זמנית בטעינת השחזור. נסו שוב.";

export function errorMessage(error) {
  const code = error?.code;
  return { title: "לא ניתן לטעון את השחזור כרגע", detail: Object.hasOwn(ERROR_MESSAGES, code) ? ERROR_MESSAGES[code] : GENERIC_ERROR };
}

/** Loading → "slow" fallback (the skeleton never runs forever). */
export const LOADING_SLOW_MS = 12000;

/**
 * Families the replay shows (table columns + spotlight line), with Hebrew
 * names and plural gender for "אינן זמינות" / "אינם זמינים". Families the UI
 * never shows (orebDreb, pf, teamOnly, score) are not summarized.
 */
export const FAMILY_LABELS = Object.freeze({
  pts: { name: "נקודות", f: true },
  fg: { name: "קליעות שדה", f: true },
  tpt: { name: "שלשות", f: true },
  ft: { name: "זריקות עונשין", f: true },
  reb: { name: "ריבאונדים", f: false },
  ast: { name: "אסיסטים", f: false },
  to: { name: "איבודים", f: false },
  stl: { name: "חטיפות", f: true },
  blk: { name: "חסימות", f: true },
});

const notAvailable = (f) => (f ? "אינן זמינות" : "אינם זמינים");
const teamLabel = (t) => t?.nameHe || t?.shortName || t?.abbreviation || "";

function fromPeriod(replay, eventIndex) {
  const period = replay?.events?.[eventIndex]?.period;
  if (!Number.isFinite(eventIndex) || eventIndex <= 0 || !period) return "";
  return ` החל מ${hePeriodLabel(period, replay?.format?.regulationPeriods ?? 4)}`;
}

/**
 * What this replay cannot show, from capabilities only.
 * Returns `{ items: [{ kind, family, scope, teamIds, playerIds, text }], probability, any }`.
 * - kind 'stat': an unavailable shown family (game scope → both teams).
 * - kind 'lineup': on-court five unavailable (roster shown instead).
 * - kind 'probability': no usable win-probability series.
 * `teamIds` lists the teams an item concerns (both for game scope), so each
 * team table can show only its own notes.
 */
export function capabilityGaps(replay, capabilities) {
  const caps = Array.isArray(capabilities) ? capabilities : [];
  const home = replay?.teams?.home;
  const away = replay?.teams?.away;
  const teamsById = new Map([away, home].filter(Boolean).map((t) => [t.id, t]));
  const both = [...teamsById.keys()];
  const players = new Map((replay?.players ?? []).map((p) => [p.id, p]));
  const items = [];

  for (const [family, label] of Object.entries(FAMILY_LABELS)) {
    const unavailable = caps.filter((c) => c.family === family && c.level === "unavailable");
    if (unavailable.length === 0) continue;
    if (!familyAvailable(caps, family)) {
      items.push({ kind: "stat", family, scope: "game", teamIds: both, playerIds: [], text: `${label.name} ${notAvailable(label.f)} בשחזור הזה.` });
      continue;
    }
    // Player scope: group per team so each table lists its own players.
    const perTeam = new Map();
    for (const c of unavailable.filter((c) => (c.scope ?? "game") === "player")) {
      for (const id of c.players ?? []) {
        const p = players.get(id);
        if (!p) continue;
        if (!perTeam.has(p.teamId)) perTeam.set(p.teamId, []);
        if (!perTeam.get(p.teamId).includes(id)) perTeam.get(p.teamId).push(id);
      }
    }
    for (const [teamId, ids] of perTeam) {
      const names = ids.map((id) => players.get(id).shortName || players.get(id).name).join(", ");
      items.push({ kind: "stat", family, scope: "player", teamIds: [teamId], playerIds: ids, text: `${label.name} של ${names} ${notAvailable(label.f)}.` });
    }
    for (const c of unavailable.filter((c) => c.scope === "team")) {
      for (const teamId of c.teams ?? []) {
        if (!teamsById.has(teamId)) continue;
        items.push({ kind: "stat", family, scope: "team", teamIds: [teamId], playerIds: [], text: `${label.name} של שחקני ${teamLabel(teamsById.get(teamId))} ${notAvailable(label.f)}${fromPeriod(replay, c.interval?.from)}.` });
      }
    }
    // teamTotal scope: the replay shows no team-total row, so nothing is hidden.
  }

  // Lineups: game scope, or team scope (optionally from an event onwards).
  const lineupCaps = caps.filter((c) => c.family === "lineups" && c.level === "unavailable");
  if (!familyAvailable(caps, "lineups")) {
    items.push({ kind: "lineup", family: "lineups", scope: "game", teamIds: both, playerIds: [], text: "ההרכב על המגרש אינו זמין — מוצג סגל הקבוצה המלא." });
  } else {
    for (const c of lineupCaps.filter((c) => c.scope === "team")) {
      for (const teamId of c.teams ?? []) {
        if (!teamsById.has(teamId)) continue;
        items.push({ kind: "lineup", family: "lineups", scope: "team", teamIds: [teamId], playerIds: [], text: `ההרכב על המגרש של ${teamLabel(teamsById.get(teamId))} אינו זמין${fromPeriod(replay, c.interval?.from)} — מוצג סגל הקבוצה.` });
      }
    }
  }

  const probability = probabilityAvailable(replay, caps);
  if (!probability) items.push({ kind: "probability", family: "probability", scope: "game", teamIds: both, playerIds: [], text: "סיכויי ניצחון אינם זמינים למשחק הזה." });

  return { items, probability, any: items.length > 0 };
}

/** Gap notes that concern one team's table (stat + lineup items). */
export function teamGapNotes(gaps, teamId) {
  return (gaps?.items ?? []).filter((i) => i.kind !== "probability" && i.teamIds.includes(teamId)).map((i) => i.text);
}

/**
 * Moments reached by replay second `sec` (hold started: startSec ≤ sec, and
 * sec > 0 — the same rule as spotlightAt), oldest first. Never includes a
 * future moment. Each: `{ momentIndex, highlightId, type, sec, eventIndex, caption, period, clock }`.
 */
export function reachedMoments(replay, sec) {
  const timeline = replay?.timeline;
  const duration = timeline?.durationSec ?? 0;
  const x = Math.min(Math.max(Number.isFinite(sec) ? sec : 0, 0), duration);
  if (x <= 0) return [];
  const byId = new Map((replay.highlights ?? []).map((h) => [h.id, h]));
  const out = [];
  for (const m of timeline.moments ?? []) {
    if (m.startSec > x) break;
    const h = byId.get(m.highlightId);
    const event = replay.events?.[m.eventIndex] ?? null;
    out.push({
      momentIndex: m.index,
      highlightId: m.highlightId,
      type: m.type,
      sec: m.startSec,
      eventIndex: m.eventIndex,
      caption: h?.caption ?? null,
      period: event ? hePeriodLabel(event.period, replay.format?.regulationPeriods ?? 4) : null,
      clock: event?.clock ?? null,
    });
  }
  return out;
}

/** Minimum gap between two live-region announcements. */
export const ANNOUNCE_MIN_MS = 4000;

/** Delay before a new announcement may replace the last one (0 = now). */
export function announceDelay(lastAt, now, minMs = ANNOUNCE_MIN_MS) {
  if (!Number.isFinite(lastAt) || lastAt <= 0) return 0;
  return Math.max(0, lastAt + minMs - now);
}
