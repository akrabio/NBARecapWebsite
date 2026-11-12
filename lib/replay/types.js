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

  // Informational warnings (do not reduce capability on their own)
  SEQUENCE_OUT_OF_ORDER: "sequence_out_of_order", // sequenceNumber < previous in array order
  IDENTICAL_RECORDS: "identical_records", // same-content records kept (not proven duplicates)
  HEAVE_EXCLUDED: "heave_excluded", // heave attempt not counted in FGA/3PA
  UNKNOWN_EVENT_TYPE: "unknown_event_type",
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
 */

/**
 * @typedef {Object} ReplayPlayer
 * @property {string} id               ESPN athlete ID
 * @property {string} teamId
 * @property {string} name             displayName
 * @property {string} shortName
 * @property {string | null} jersey
 * @property {boolean} starter         Box-score starter flag (initial lineup source)
 * @property {boolean} didNotPlay
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
 * @property {string[]} [technical]    Players charged with a technical (may be bench)
 * @property {string} [fouled]         Only when text says "(X draws the foul)"
 * @property {string[]} [jumpers]      Jump-ball contestants (order not meaningful)
 * @property {string} [possession]     Jump-ball possession gainer
 * @property {string} [entering]       Substitution
 * @property {string} [leaving]        Substitution
 */

/**
 * @typedef {Object} EventIssue
 * @property {string} code             One of REASON_CODES
 * @property {string} [role]
 * @property {string} [detail]
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
 * @property {{ made?: boolean, points?: number, attemptValue?: 2|3, heave?: boolean, offensive?: boolean, ftKind?: "regular"|"technical"|"flagrant", teamOnly?: boolean }} detail
 * @property {{ home: number, away: number }} scoreAfter
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
 *
 * @typedef {Object} TeamOnlyCounters
 * @property {number} teamReb
 * @property {number} teamOreb
 * @property {number} teamDreb
 * @property {number} teamTo
 */

/**
 * Counter changes produced by one event. Negative values are allowed only for
 * explicit, source-supported corrections (none observed in the corpus).
 *
 * @typedef {Object} StatDelta
 * @property {number} eventIndex
 * @property {string | null} playerId  null for team-only deltas
 * @property {string} teamId
 * @property {Partial<PlayerCounters> | Partial<TeamOnlyCounters>} delta
 */

/**
 * @typedef {Object} TeamLineup
 * @property {string[]} onCourt        Ordered slots; length 5 when valid
 * @property {string[]} bench          All other non-DNP roster IDs
 * @property {boolean} valid           Five distinct players, consistent with evidence
 * @property {string | null} issue     REASON_CODES value when invalid
 */

/**
 * Lineup state after an event (or after a complete substitution group).
 *
 * @typedef {Object} LineupState
 * @property {number} eventIndex
 * @property {Record<string, TeamLineup>} teams  Keyed by team ID
 */

/**
 * @typedef {Object} Capability
 * @property {string} family           One of CAPABILITY_FAMILIES
 * @property {string} level            One of CAPABILITY_LEVELS
 * @property {string[]} reasons        REASON_CODES values
 * @property {string[]} [players]      Affected player IDs when the limitation is per-player
 * @property {string[]} [teams]        Affected team IDs
 * @property {{ from: number, to: number } | null} [interval]  Affected event-index range
 */

/**
 * Immutable snapshot used for seeking (state *after* `eventIndex`).
 *
 * @typedef {Object} Checkpoint
 * @property {number} eventIndex
 * @property {{ home: number, away: number }} score
 * @property {Record<string, PlayerCounters>} players
 * @property {Record<string, TeamOnlyCounters>} teams
 * @property {Record<string, TeamLineup>} lineups
 * @property {number | null} homeWinProbability  Last linked sample at or before eventIndex
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
 * @typedef {Object} TimelineSegment
 * @property {"fast" | "hold"} kind
 * @property {number} replayStartSec
 * @property {number} replayEndSec
 * @property {number} fromEventIndex   fast: first event revealed; hold: = toEventIndex
 * @property {number} toEventIndex     fast: last event revealed; hold: the held boundary
 * @property {string} [highlightId]    hold only
 */

/**
 * @typedef {Object} ReplayPayload
 * @property {{ home: ReplayTeam, away: ReplayTeam }} teams
 * @property {ReplayPlayer[]} players
 * @property {NormalizedEvent[]} events
 * @property {Record<string, TeamLineup>} initialLineups
 * @property {Checkpoint[]} checkpoints
 * @property {{ eventIndex: number, home: number }[]} probability  Linked samples only
 * @property {Highlight[]} highlights
 * @property {TimelineSegment[]} timeline
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
