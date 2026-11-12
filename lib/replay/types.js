// Shared shapes and stable codes for the game replay (task R04).
//
// The typedefs below are the contract between the pure replay modules
// (normalize → stats/lineups → state → validate → highlights → timeline →
// build) and the API/client. They describe *normalized* data; raw ESPN fields
// are only referenced in comments. Source evidence for every role rule lives
// in docs/replay-implementation/source-findings.md.
//
// Rules that apply to every shape:
// - IDs are ESPN string IDs (team `"17"`, athlete `"4278067"`, play
//   `"4018100624"`). Never display names.
// - "Unknown" is explicit (`null` / absent role / capability `unavailable`),
//   never a fabricated 0.
// - Everything is plain JSON (no Map/Set/typed arrays) so it can be
//   serialized by the API route unchanged.

/** Bump when the serialized replay shape changes. */
export const REPLAY_SCHEMA_VERSION = 1;

/**
 * Normalized action kinds. Unknown source types map to `other` and keep their
 * source type in `NormalizedEvent.source`.
 */
export const EVENT_KINDS = Object.freeze({
  FIELD_GOAL: "field_goal", // made/missed/blocked 2 or 3 (incl. heaves, flagged)
  FREE_THROW: "free_throw", // regular, and-one, technical, flagrant
  REBOUND: "rebound", // offensive/defensive, player or team
  TURNOVER: "turnover", // player or team, optional steal
  FOUL: "foul", // fouls counted in PF (personal, shooting, offensive, loose ball, take, away-from-play, flagrant)
  TECHNICAL: "technical", // technical/flopping/def. 3-seconds/double technical — not PF
  VIOLATION: "violation", // goaltending, kicked ball, delay of game (no player counter)
  SUBSTITUTION: "substitution",
  JUMP_BALL: "jump_ball",
  TIMEOUT: "timeout",
  REVIEW: "review", // coach's challenge / ref review annotations (no stat effect observed)
  PERIOD_END: "period_end",
  GAME_END: "game_end",
  OTHER: "other",
});

/** Statistic families whose running values can be independently trusted or disabled. */
export const CAPABILITY_FAMILIES = Object.freeze({
  SCORE: "score", // team score / points per event
  PTS: "pts",
  FG: "fg", // fgm/fga
  TPT: "tpt", // tpm/tpa
  FT: "ft", // ftm/fta
  REB: "reb",
  OREB_DREB: "orebDreb",
  AST: "ast",
  TO: "to",
  STL: "stl",
  BLK: "blk",
  PF: "pf",
  TEAM_ONLY: "teamOnly", // team rebounds / team turnovers
  LINEUPS: "lineups", // active five per team
  PROBABILITY: "probability",
});

/** Capability levels, ordered from best to worst. */
export const CAPABILITY_LEVELS = Object.freeze({
  RELIABLE: "reliable", // reconstructs and reconciles with the final box score
  LIMITED: "limited", // usable with documented caveats (e.g. one unexplained mismatch)
  UNAVAILABLE: "unavailable", // hide/label; never show fabricated values
});

/**
 * Stable reason codes for `BuildResult.reasons` / `warnings` and for
 * per-event `issues`. Strings are part of the API contract: add new codes,
 * never rename existing ones.
 */
export const REASON_CODES = Object.freeze({
  // Unavailable (whole replay)
  GAME_NOT_FINAL: "game_not_final",
  NO_PLAYS: "no_plays",
  NO_BOXSCORE: "no_boxscore",
  MISSING_TEAMS: "missing_teams",
  SCORE_COVERAGE_GAP: "score_coverage_gap", // event scores do not reach the header final
  SCORE_REGRESSION: "score_regression", // score decreases in normalized order
  UNPARSEABLE_CLOCK: "unparseable_clock",

  // Limited (family-level)
  STAT_MISMATCH: "stat_mismatch", // reconstructed player/team total ≠ box score
  UNKNOWN_ATHLETE: "unknown_athlete", // participant not in box-score roster
  ROLE_TEXT_CONFLICT: "role_text_conflict", // structured participant contradicts play text
  ROLE_UNRESOLVED: "role_unresolved", // role required but neither structured nor text-verifiable
  LINEUP_INVALID: "lineup_invalid", // not five distinct players after a substitution group
  LINEUP_ACTOR_OFF_COURT: "lineup_actor_off_court", // role-bearing player not on tracked court
  LINEUP_SUB_INCONSISTENT: "lineup_sub_inconsistent", // entering already on / leaving not on
  LINEUP_NO_STARTERS: "lineup_no_starters", // box score lacks five starters for a team
  PROBABILITY_MISSING: "probability_missing",
  PROBABILITY_UNLINKED: "probability_unlinked", // sample's playId not in plays
  PROBABILITY_OUT_OF_RANGE: "probability_out_of_range",
  PROBABILITY_CONFLICT: "probability_conflict", // different samples for one play, or playId shared by several events (discarded)

  // Informational warnings (do not reduce capability on their own)
  SEQUENCE_OUT_OF_ORDER: "sequence_out_of_order", // sequenceNumber < previous in array order
  SCORE_SNAPSHOT_OUT_OF_ORDER: "score_snapshot_out_of_order", // stale source score proven to omit exactly the points of later-recorded scoring plays placed earlier; carried score used (source-findings §10)
  IDENTICAL_RECORDS: "identical_records", // same-content records kept (not proven duplicates)
  HEAVE_EXCLUDED: "heave_excluded", // heave attempt not counted in FGA/3PA
  UNKNOWN_EVENT_TYPE: "unknown_event_type",

  // Normalization issues (R05–R06)
  ROLE_TEAM_CONFLICT: "role_team_conflict", // role player on the wrong side (e.g. assister not a teammate)
  UNKNOWN_TEAM: "unknown_team", // play/box team ID is neither the home nor the away team
  INVALID_PERIOD: "invalid_period", // missing or non-positive period number
  INVALID_SCORE: "invalid_score", // missing/non-numeric event score (kept as null)
  UNKNOWN_SHOT_VALUE: "unknown_shot_value", // field goal without a 2/3 attempt value
  DUPLICATE_RECORD: "duplicate_record", // proven duplicate (same play ID, same content) dropped
  DUPLICATE_ID_CONFLICT: "duplicate_id_conflict", // same play ID, different content; both kept
  CLOCK_FALLBACK: "clock_fallback", // clock.displayValue unparseable; numeric clock.value used instead

  // Stat deltas (R07–R09)
  ATTRIBUTION_UNKNOWN: "attribution_unknown", // stat credit known at team level, player unknown (kept in `unattributed`)
  SCORE_DELTA_MISMATCH: "score_delta_mismatch", // points credited by an event ≠ change in source scoreAfter

  // Validation / quality classification (R14)
  PERIOD_SCORE_MISMATCH: "period_score_mismatch", // reconstructed points in a period ≠ header linescore (→ unavailable)
  PERIOD_SCORES_MISSING: "period_scores_missing", // header has no usable linescores; per-period check skipped (warning)
  CLOCK_COVERAGE_GAP: "clock_coverage_gap", // too many events without a usable period/clock to place them (→ unavailable)
  STAT_UNVERIFIABLE: "stat_unverifiable", // box score has no expectation for a family; running values cannot be validated
  NO_GAME_END: "no_game_end", // no end-of-game marker in the play feed (→ unavailable: truncated play-by-play)
  NO_FINAL_PERIOD_END: "no_final_period_end", // no end-of-period marker for the last period (→ unavailable)
  LINEUP_INVARIANT: "lineup_invariant", // a tracked lineup state broke a structural invariant (→ fallback for the team)

  // Builder (R23)
  INPUT_TOO_LARGE: "input_too_large", // summary exceeds the builder's size cap; rejected before any heavy work (→ unavailable)
});

/**
 * @typedef {"home" | "away"} Side
 */

/**
 * @typedef {Object} ReplayTeam
 * @property {string} id               ESPN team ID
 * @property {Side} side
 * @property {string} abbreviation
 * @property {string} name
 * @property {number} finalScore       From header; validation only, never shown as initial state
 * @property {number[] | null} periodScores  Header linescores per period; validation only
 */

/**
 * @typedef {Object} ReplayPlayer
 * @property {string} id               ESPN athlete ID
 * @property {string} teamId
 * @property {string} name             displayName
 * @property {string} shortName
 * @property {string | null} jersey
 * @property {string | null} position Position abbreviation (e.g. "G")
 * @property {boolean} starter         Box-score starter flag (initial lineup source)
 * @property {boolean} didNotPlay
 * @property {string | null} dnpReason Box-score `reason` when didNotPlay
 * @property {boolean | null} active   Box `active` (appears to mean on court at the final horn)
 * @property {boolean | null} ejected
 */

/**
 * Final box-score values, parsed from stat labels. Validation only — never a
 * running/initial value. Every field is null when the label or value is absent.
 *
 * @typedef {Object} ExpectedCounters
 * @property {number | null} pts
 * @property {number | null} fgm
 * @property {number | null} fga
 * @property {number | null} tpm
 * @property {number | null} tpa
 * @property {number | null} ftm
 * @property {number | null} fta
 * @property {number | null} reb
 * @property {number | null} oreb
 * @property {number | null} dreb
 * @property {number | null} ast
 * @property {number | null} to
 * @property {number | null} stl
 * @property {number | null} blk
 * @property {number | null} pf
 */

/**
 * Team final values (box `teams[].statistics` by name; `pts` from header).
 *
 * @typedef {ExpectedCounters & { teamTo: number | null, totalTo: number | null, technicalFouls: number | null }} ExpectedTeamCounters
 */

/**
 * Role IDs on a normalized event. A role is present only when verified (see
 * source-findings.md role map); otherwise it is absent and an issue is
 * recorded. Participant array position is NOT a role by itself.
 *
 * @typedef {Object} EventRoles
 * @property {string} [shooter]        FG/FT attempter
 * @property {string} [assister]       Made FG with "(X assists)"
 * @property {string} [blocker]        "X blocks Y's …"
 * @property {string} [rebounder]      Absent on team rebounds
 * @property {string} [turnoverBy]     Absent on team turnovers
 * @property {string} [stealer]        "(X steals)"
 * @property {string} [fouler]
 * @property {string} [doubleFouler]   Opponent also charged a PF on a double personal foul (type 36)
 * @property {string[]} [technical]    Players charged with a technical (may be bench)
 * @property {string} [fouled]         Only when text says "(X draws the foul)"
 * @property {string[]} [jumpers]      Jump-ball contestants (order not meaningful)
 * @property {string} [possession]     Jump-ball possession gainer
 * @property {string} [violator]       Goaltending / kicked ball (no player counter)
 * @property {string} [entering]       Substitution
 * @property {string} [leaving]        Substitution
 */

/**
 * @typedef {Object} EventIssue
 * @property {string} code             One of REASON_CODES
 * @property {string} [role]
 * @property {string} [detail]
 * @property {string} [candidate]      Text-matched roster ID for a dropped role (diagnostic only, never applied)
 */

/**
 * One normalized event, in source array order.
 *
 * @typedef {Object} NormalizedEvent
 * @property {number} index            0-based position in normalized order (= ESPN array order)
 * @property {string} sourcePlayId     ESPN play `id`
 * @property {number} sourceSequence   ESPN `sequenceNumber` (diagnostics only; not an ordering key)
 * @property {{ typeId: string, typeText: string }} source
 * @property {number} period           1–4, 5+ overtime
 * @property {number | null} clockRemainingSec  Decimal seconds remaining in period; null if unparsed
 * @property {number | null} gameElapsedSec     Including 5-minute overtimes; null if clock unknown
 * @property {string} kind             One of EVENT_KINDS
 * @property {string | null} teamId    Acting team (ESPN `team.id`; for blocks this is the SHOOTER's team)
 * @property {EventRoles} roles
 * @property {{ made?: boolean, points?: number, attemptValue?: 2|3|null, heave?: boolean, blocked?: boolean, offensive?: boolean, ftKind?: "regular"|"technical"|"flagrant", teamOnly?: boolean }} detail
 * @property {{ home: number | null, away: number | null }} scoreAfter  null side = invalid source score (with issue)
 * @property {{ home: number | null, away: number | null }} [sourceScoreAfter]  Raw source score, present only when `scoreAfter` was carried over a proven-stale snapshot (`score_snapshot_out_of_order`)
 * @property {string} text             Plain source text (never HTML), for captions/diagnostics
 * @property {string | null} substitutionGroup  Shared ID for subs at one period/clock boundary
 * @property {EventIssue[]} issues
 */

/**
 * Player counters. Optional families are omitted when not supported.
 *
 * @typedef {Object} PlayerCounters
 * @property {number} pts
 * @property {number} fgm
 * @property {number} fga
 * @property {number} tpm
 * @property {number} tpa
 * @property {number} ftm
 * @property {number} fta
 * @property {number} reb
 * @property {number} [oreb]
 * @property {number} [dreb]
 * @property {number} ast
 * @property {number} to
 * @property {number} stl
 * @property {number} blk
 * @property {number} [pf]
 */

/**
 * Team-only counters, kept separate from player sums (box-score team
 * rebounds exclude team rebounds; teamTurnovers is reported separately).
 * `technicalFouls` counts technicals charged to the team's players (or the
 * acting team when no player is verified); validates against box
 * `technicalFouls`. Technicals are never part of PF.
 *
 * @typedef {Object} TeamOnlyCounters
 * @property {number} teamReb
 * @property {number} teamOreb
 * @property {number} teamDreb
 * @property {number} teamTo
 * @property {number} technicalFouls
 */

/**
 * Counter changes produced by one event (`eventStatDeltas` in stats.js).
 * All buckets are keyed by ID and contain only non-zero counters. Negative
 * values are allowed only for explicit, source-supported corrections (none
 * observed in the corpus).
 *
 * @typedef {Object} EventStatDeltas
 * @property {number} eventIndex
 * @property {Record<string, Partial<PlayerCounters>>} players       By athlete ID
 * @property {Record<string, Partial<TeamOnlyCounters>>} teams       Team-only counters by team ID
 * @property {Record<string, Partial<PlayerCounters>>} unattributed  Player-type credit whose player is unknown, by team ID
 * @property {Record<string, number>} points   Points scored by team ID (player + unattributed)
 * @property {EventIssue[]} issues              e.g. attribution_unknown (with `role`, `family`), heave_excluded
 */

/**
 * Rules and recovery: lib/replay/lineups.js header.
 *
 * @typedef {Object} TeamLineup
 * @property {string[]} onCourt        Ordered stable slots; exactly 5 when valid, EMPTY when invalid
 * @property {string[]} bench          Other roster IDs in box order (includes DNP; DNP is never on court).
 *                                     When invalid: the whole team roster (roster fallback).
 * @property {boolean} valid           Five distinct players, consistent with substitutions and on-court evidence
 * @property {string | null} issue     REASON_CODES value when invalid
 * @property {number | null} invalidSince  Event index where the current invalid interval began (-1 = from tip-off)
 * @property {string[]} candidates     Invalid only: best-effort tracked set (may be ≠ 5; never display as a five)
 * @property {string[]} confirmed      Invalid only: candidates evidenced on court since `invalidSince`
 */

/**
 * Lineup state after an event. A substitution group is applied atomically at
 * its last event; earlier members leave `teams` unchanged and are listed in
 * `pendingSubs`.
 *
 * @typedef {Object} LineupState
 * @property {number} eventIndex       -1 before the first event
 * @property {Record<string, TeamLineup>} teams  Keyed by team ID
 * @property {number[]} pendingSubs    Event indices of an unfinished substitution group
 */

/**
 * @typedef {Object} Capability
 * @property {string} family           One of CAPABILITY_FAMILIES
 * @property {string} level            One of CAPABILITY_LEVELS
 * @property {string[]} reasons        REASON_CODES values
 * @property {string[]} [players]      Affected player IDs when the limitation is per-player
 * @property {string[]} [teams]        Affected team IDs
 * @property {{ from: number, to: number } | null} [interval]  Affected event-index range
 * @property {"game" | "player" | "team" | "teamTotal"} [scope]  Set by validate.js: one "game" entry per
 *   family; "player"/"team"/"teamTotal" entries scope a limitation (resolve with `capabilityFor`)
 */

/**
 * One linked win-probability sample (R12, `lib/replay/probability.js`):
 * the probability AFTER `eventIndex`. `derived` samples are synthesized
 * (final-whistle certainty, opt-in) and must be labeled as such.
 *
 * @typedef {Object} ProbabilitySample
 * @property {number} eventIndex
 * @property {string | null} sourcePlayId
 * @property {number} home             Home win fraction in [0, 1]
 * @property {number | null} tie       Tie fraction when the source gives one
 * @property {boolean} derived
 */

/**
 * Carried-forward probability in a replay state; `null` (in `ReplayState`)
 * before the first linked sample — never a fabricated 0.5.
 *
 * @typedef {Object} StateProbability
 * @property {number} home
 * @property {number | null} tie
 * @property {number} sourceEventIndex Event index of the sample being carried
 * @property {boolean} derived
 */

/**
 * Running replay state AFTER `eventIndex` (-1 = 0–0 start). Produced by
 * `lib/replay/state.js`; plain JSON. Checkpoints are deep-frozen instances.
 *
 * @typedef {Object} ReplayState
 * @property {number} eventIndex
 * @property {{ home: number, away: number }} score         Source-backed (last valid `scoreAfter` per side)
 * @property {{ home: number, away: number }} creditedScore Points credited by stat deltas (diagnostic; differs only with `score_delta_mismatch`)
 * @property {Record<string, PlayerCounters>} players       Every rostered player, bench included
 * @property {Record<string, TeamOnlyCounters>} teams
 * @property {Record<string, Partial<PlayerCounters>>} unattributed  By team ID
 * @property {{ teams: Record<string, TeamLineup>, pendingSubs: number[] }} lineups
 * @property {StateProbability | null} probability
 */

/**
 * Immutable snapshot used for seeking (state *after* `eventIndex`).
 *
 * @typedef {ReplayState} Checkpoint
 */

/**
 * A selected key moment.
 *
 * @typedef {Object} Highlight
 * @property {string} id               Stable within a builder version
 * @property {number} eventIndex       Exact event boundary the hold shows
 * @property {number} [groupEndIndex]  For grouped sequences (steal → basket)
 * @property {string} type             e.g. "lead_change", "go_ahead", "run", "big_shot", "block", "steal", "period_end"
 * @property {string[]} playerIds
 * @property {string[]} teamIds
 * @property {Record<string, string | number>} captionParams  Plain values for Hebrew templates
 * @property {Record<string, unknown>} evidence  Score before/after, probability before/after, etc.
 * @property {number} importance
 * @property {number} holdSec
 */

/**
 * @typedef {Object} TimelineSegment  (built by `lib/replay/timeline.js`)
 * @property {"fast" | "hold"} kind
 * @property {number} startSec         replay seconds, half-open [startSec, endSec)
 * @property {number} endSec
 * @property {number} fromEventIndex   fast: first event revealed; hold: = toEventIndex
 * @property {number} toEventIndex     fast: last event revealed; hold: the held boundary
 * @property {number[]} [revealSec]    fast only: replay second each event from..to is applied
 * @property {number} [eventsPerSec]   fast only: visual batching hint
 * @property {number} [eventIndex]     hold only (= toEventIndex)
 * @property {string} [highlightId]    hold only
 * @property {number} [momentIndex]    hold only
 */

/**
 * Client payload built by `lib/replay/build.js` (field-level docs in its
 * header). Compact wire shapes, not the normalized/server types.
 *
 * @typedef {Object} ReplayPayload
 * @property {{ regulationPeriods: number, regulationSec: number, overtimeSec: number }} format
 * @property {{ home: object, away: object }} teams   id, side, abbreviation, name, shortName, nameHe, color, alternateColor, logo
 * @property {object[]} players   id, teamId, name, shortName, jersey, position, starter, dnp, dnpReason?; per team: starters (box order), then bench by jersey, then name
 * @property {object[]} events    index, period, clock, clockSec, kind, teamId, score {home, away}, roles?, made?, points?, value?, subGroup?
 * @property {{ initial: ReplayState, patches: object[] }} state  Initial state (index -1) + one changed-values patch per event; read with client-state.js `replayStateAt`
 * @property {{ eventIndex: number, home: number, tie?: number, derived?: true }[]} probability  Linked samples only (+ labeled derived ones); source of state.probability on the client
 * @property {{ id: string, type: string, eventIndex: number, keyEventIndex: number, groupStartIndex: number, groupEndIndex: number, playerIds: string[], teamIds: string[], caption: { text: string, parts: object[] } | null }[]} highlights  No evidence/captionParams
 * @property {{ version: number, durationSec: number, targetSec: number, segments: TimelineSegment[], moments: object[], periods: object[], lastEventIndex: number }} timeline
 * @property {number} durationSec
 */

/**
 * Result of the pure builder and body of `GET /api/replay/[gameId]`.
 *
 * @typedef {Object} BuildResult
 * @property {number} schemaVersion    REPLAY_SCHEMA_VERSION
 * @property {number} builderVersion
 * @property {"ready" | "limited" | "unavailable"} status
 * @property {string} espnGameId
 * @property {Capability[]} capabilities
 * @property {string[]} reasons        REASON_CODES that set `status`
 * @property {{ code: string, count?: number, detail?: string }[]} warnings
 * @property {ReplayPayload | null} replay  null when unavailable
 */
