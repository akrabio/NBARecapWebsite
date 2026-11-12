// Running scoreboard (R31 stub; finished in W16 / R32). Renders only the
// frame's running score — never the final result before the replay ends.

const teamLabel = (team) => team.nameHe || team.shortName || team.abbreviation;

export default function ReplayScoreboard({ frame, teams }) {
  const { state, event } = frame;
  const { ended, periodLabel } = frame.frame;
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center" data-event-index={frame.frame.eventIndex}>
      <b className="truncate">{teamLabel(teams.away)}</b>
      <span className="text-[28px] font-black tabular-nums" dir="ltr">
        {state.score?.away ?? 0}–{state.score?.home ?? 0}
      </span>
      <b className="truncate">{teamLabel(teams.home)}</b>
      <p className="col-span-3 text-xs text-subtle">
        {ended ? "סיום" : periodLabel ? `${periodLabel}${event?.clock ? ` · ${event.clock}` : ""}` : "לפני פתיחה"}
      </p>
    </div>
  );
}
