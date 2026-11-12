// Running scoreboard (task R32). Renders only the frame's running score —
// never the final result before the replay ends. The score comes straight
// from the frame's reconstructed state (no accumulation in the component).
//
// Score emphasis: a side's score flashes briefly only when it changes during
// forward playback by a small step of events (natural play). Seeks, moment
// jumps, restarts and the initial render never flash; reduced motion turns
// the flash off (replay.module.css). No winner styling until the end.

import { useState } from "react";
import TeamLogo from "@/components/ui/TeamLogo";
import { gameClockStatus } from "@/lib/replay/display";
import styles from "./replay.module.css";

// Max events advanced between two renders that still count as "playing
// forward" (a 60 fps tick reveals at most a few events; jumps are larger).
const NATURAL_STEP = 12;

/**
 * Per-side flash counter, adjusted during render (React's "store info from
 * previous renders" pattern): bumps only on a natural forward step that
 * changed that side's score while playing.
 */
function useScorePulses(eventIndex, score, playing) {
  const [track, setTrack] = useState({ eventIndex, home: score.home, away: score.away, pulse: { home: 0, away: 0 } });
  if (track.eventIndex !== eventIndex) {
    const step = eventIndex - track.eventIndex;
    const natural = playing && step > 0 && step <= NATURAL_STEP;
    const pulse = { ...track.pulse };
    if (natural && score.home !== track.home) pulse.home += 1;
    if (natural && score.away !== track.away) pulse.away += 1;
    setTrack({ eventIndex, home: score.home, away: score.away, pulse });
    return pulse;
  }
  return track.pulse;
}

function TeamSide({ team, side, score, pulse, dim }) {
  const home = side === "home";
  return (
    <div className={`flex min-w-0 items-center gap-2.5 max-[520px]:flex-wrap max-[520px]:justify-center ${home ? "flex-row-reverse" : ""}`}>
      <TeamLogo teamName={team.siteName} hebrewName={team.nameHe} alt="" className="!h-10 !w-10 shrink-0 max-[520px]:!h-7 max-[520px]:!w-7" />
      <div className={`min-w-0 flex-1 max-[520px]:flex-none ${home ? "text-left" : "text-right"} max-[520px]:text-center`}>
        <b className="block truncate text-[15px] max-[520px]:text-[12.5px]">{team.nameHe || team.shortName || team.abbreviation}</b>
        <small className="block text-[11px] text-subtle max-[520px]:hidden">
          <bdi dir="ltr">{team.abbreviation}</bdi> · {home ? "בית" : "חוץ"}
        </small>
      </div>
      <span
        key={pulse}
        dir="ltr"
        className={`px-1 text-[40px] leading-none font-black tracking-tight tabular-nums max-[520px]:w-full max-[520px]:text-center max-[520px]:text-[34px] ${pulse ? styles.scoreFlash : ""} ${dim ? "text-subtle" : ""}`}
        style={{ "--flash-c": team.uiColor }}
      >
        {score}
      </span>
    </div>
  );
}

export default function ReplayScoreboard({ frame, teams, playing, regulationPeriods }) {
  const score = { home: frame.state.score?.home ?? 0, away: frame.state.score?.away ?? 0 };
  const pulses = useScorePulses(frame.frame.eventIndex, score, playing);
  const status = gameClockStatus(frame, regulationPeriods);
  const ended = status.phase === "end";
  // Final styling only once the replay has reached the end.
  const loser = ended && score.home !== score.away ? (score.home < score.away ? "home" : "away") : null;

  return (
    <div
      className="grid grid-cols-[minmax(0,1fr)_92px_minmax(0,1fr)] items-center gap-3 px-5 pt-4 pb-2 max-[520px]:grid-cols-[minmax(0,1fr)_72px_minmax(0,1fr)] max-[520px]:gap-1.5 max-[520px]:px-3 max-[520px]:pt-3"
      data-event-index={frame.frame.eventIndex}
    >
      <TeamSide team={teams.away} side="away" score={score.away} pulse={pulses.away} dim={loser === "away"} />
      <div className="text-center tabular-nums">
        <small className={`block text-[11px] font-extrabold ${status.phase === "live" ? "text-brand" : "text-subtle"}`}>{status.label}</small>
        {status.clock && (
          <b className="block text-[23px] leading-tight max-[520px]:text-[20px]" dir="ltr" aria-label={`שעון המשחק ${status.clock}`}>
            {status.clock}
          </b>
        )}
      </div>
      <TeamSide team={teams.home} side="home" score={score.home} pulse={pulses.home} dim={loser === "home"} />
    </div>
  );
}
