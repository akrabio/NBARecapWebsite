// Key-moment spotlight (task R34). Shows the most recently reached moment —
// independent of the selected stats team, so an opponent's play appears here
// without switching the tables.
//
// - Caption rendered from `caption.parts` as text nodes; isolated parts
//   (players, teams, scores, clocks) are wrapped in <bdi dir>.
// - Player moments: initials avatar in the team color, plus the team name in
//   text (identity never relies on color alone). Stat values come from the
//   SNAPSHOT at the moment (`frame.spotlight.state`), never the running state
//   or final totals; once the hold ends and play continues they are labelled
//   "באותו רגע".
// - Team-only moments show the team badge; no player is invented.
// - Stat families unavailable for the player are omitted, not shown as 0.
// - Announcements (R40): the ONE polite live region carries only moment
//   captions, rate-limited to one per ANNOUNCE_MIN_MS (lib/replay/messages.js):
//   moments reached in quick succession (fast playback, scrubbing) collapse to
//   the latest. Scores, clocks and stat cells are never announced.
// - No portraits are loaded: players get an initials avatar (nothing to
//   break); team-only moments use TeamLogo, which falls back to initials on a
//   broken image.

import { useEffect, useRef, useState } from "react";
import TeamLogo from "@/components/ui/TeamLogo";
import { hePeriodLabel, initials, momentTeamId, MOMENT_TYPE_LABELS, spotlightStatLine } from "@/lib/replay/display";
import { ANNOUNCE_MIN_MS, announceDelay } from "@/lib/replay/messages";
import styles from "./replay.module.css";

/** Latest `text`, released at most once per `minMs` (intermediate values dropped). */
function useRateLimitedText(text, minMs = ANNOUNCE_MIN_MS) {
  const [shown, setShown] = useState("");
  const lastAt = useRef(0);
  useEffect(() => {
    if (text === shown) return undefined;
    const timer = setTimeout(() => {
      lastAt.current = text ? Date.now() : lastAt.current;
      setShown(text);
    }, text ? announceDelay(lastAt.current, Date.now(), minMs) : 0);
    return () => clearTimeout(timer);
  }, [text, shown, minMs]);
  return shown;
}

export function CaptionText({ caption }) {
  if (!caption) return null;
  return caption.parts.map((part, i) =>
    part.isolate ? (
      <bdi key={i} dir={part.dir || "auto"}>
        {part.value}
      </bdi>
    ) : (
      <span key={i}>{part.value}</span>
    ),
  );
}

function Empty() {
  return (
    <section className={`${styles.spotlight} grid min-h-[104px] grid-cols-[48px_minmax(0,1fr)] items-center gap-3 px-5 py-3 max-[520px]:grid-cols-[36px_minmax(0,1fr)] max-[520px]:gap-2.5 max-[520px]:px-3`} aria-label="הרגע המרכזי">
      <div className={`${styles.avatar} grid h-12 w-12 place-items-center rounded-[14px] text-[17px] text-white max-[520px]:h-9 max-[520px]:w-9`} aria-hidden="true">
        ▶
      </div>
      <div>
        <p className="text-[15px] leading-snug font-extrabold max-[520px]:text-[13.5px]">מ־0–0 ועד השריקה האחרונה</p>
        <p className="mt-1 text-[11.5px] text-subtle">רגעי המפתח של המשחק יופיעו כאן במהלך השחזור.</p>
      </div>
    </section>
  );
}

export default function ReplaySpotlight(props) {
  const highlight = props.frame.spotlight?.highlight;
  const announcement = useRateLimitedText(highlight?.caption?.text ?? "");
  return (
    <>
      {highlight ? <Moment {...props} /> : <Empty />}
      {/* Persistent live region: moment captions only, rate-limited (never per frame). */}
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </>
  );
}

function Moment({ frame, replay, teams, capabilities, regulationPeriods }) {
  const spotlight = frame.spotlight;
  const highlight = spotlight.highlight;

  const playerId = highlight.playerIds?.[0];
  const player = playerId ? replay.players.find((p) => p.id === playerId) : null;
  // Only an unambiguous team (never the first of [away, home] for neutral moments).
  const teamId = momentTeamId(highlight, { players: replay.players, teams, score: spotlight.state?.score });
  const team = teamId === teams.home.id ? teams.home : teamId === teams.away.id ? teams.away : null;
  const event = replay.events?.[spotlight.eventIndex] ?? null;
  const stats = player ? spotlightStatLine(spotlight.state, player, capabilities, spotlight.eventIndex) : [];
  const period = event ? hePeriodLabel(event.period, regulationPeriods) : null;
  const typeLabel = MOMENT_TYPE_LABELS[highlight.type];
  const teamName = team?.nameHe || team?.abbreviation;

  return (
    <section
      className={`${styles.spotlight} grid min-h-[104px] grid-cols-[48px_minmax(0,1fr)] items-center gap-3 px-5 py-3 max-[520px]:grid-cols-[36px_minmax(0,1fr)] max-[520px]:items-start max-[520px]:gap-2.5 max-[520px]:px-3`}
      style={{ "--mc": team?.uiColor }}
      aria-label="הרגע המרכזי"
      data-moment={spotlight.momentIndex}
    >
      {/* Re-keyed per moment so the entrance animation plays once per new moment. */}
      <div
        key={spotlight.momentIndex}
        className={`${styles.avatar} ${styles.spotlightIn} grid h-12 w-12 place-items-center rounded-[14px] text-[17px] font-black text-white max-[520px]:mt-1 max-[520px]:h-9 max-[520px]:w-9 max-[520px]:text-[13px]`}
        aria-hidden="true"
      >
        {player ? (
          <bdi dir="ltr">{initials(player.name || player.shortName)}</bdi>
        ) : team ? (
          <TeamLogo teamName={team.siteName} hebrewName={team.nameHe} alt="" size="sm" />
        ) : (
          "★"
        )}
      </div>
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-x-1.5 text-[10.5px] text-subtle tabular-nums max-[520px]:text-[9.5px]">
          {typeLabel && <span className="font-bold">{typeLabel}</span>}
          {period && (
            <span>
              · {period}
              {event?.clock ? (
                <>
                  {" "}
                  <bdi dir="ltr">{event.clock}</bdi>
                </>
              ) : null}
            </span>
          )}
          {teamName && (
            <span>
              · {teamName} (<bdi dir="ltr">{team.abbreviation}</bdi>)
            </span>
          )}
        </p>
        <p className={`mt-0.5 text-[16.5px] leading-snug font-extrabold max-[520px]:text-[14px] ${spotlight.active ? "text-ink" : "text-body"}`}>
          <CaptionText caption={highlight.caption} />
        </p>
        {player && stats.length > 0 && (
          <p className="mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[11px] text-subtle tabular-nums max-[520px]:text-[10px]">
            <span>
              <bdi>{player.shortName || player.name}</bdi> {spotlight.active ? "עד כה:" : "באותו רגע:"}
            </span>
            {stats.map((s) => (
              <span key={s.key} dir={s.ltr ? "ltr" : undefined}>
                {s.ltr ? (
                  <>
                    {s.label} <b className="text-ink">{s.value}</b>
                  </>
                ) : (
                  <>
                    <b className="text-ink">{s.value}</b> {s.label}
                  </>
                )}
              </span>
            ))}
          </p>
        )}
      </div>
    </section>
  );
}
