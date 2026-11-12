// Team tabs + active-five table (R31 stub; finished in W17 / R35–R36).
// Selection and bench expansion are owned by the replay container and passed
// in; this component only presents them. DNP flags are not shown (they come
// from the final box score and would leak future decisions before tip-off).

export default function ReplayTeamTables({ frame, replay, selectedTeamId, onSelectTeam, benchExpanded, onToggleBench }) {
  const { home, away } = replay.teams;
  const lineup = frame.state.lineups?.teams?.[selectedTeamId];
  const roster = replay.players.filter((p) => p.teamId === selectedTeamId).map((p) => p.id);
  const byId = (id) => replay.players.find((p) => p.id === id);
  const row = (id) => {
    const p = byId(id);
    return (
      <li key={id} className="flex justify-between gap-2">
        <span className="truncate">{p?.shortName || p?.name || id}</span>
        <span className="tabular-nums">{frame.state.players?.[id]?.pts ?? 0}</span>
      </li>
    );
  };
  return (
    <div className="mt-5">
      <div className="flex gap-2" role="group" aria-label="קבוצה">
        {[away, home].map((team) => (
          <button
            key={team.id}
            type="button"
            aria-pressed={team.id === selectedTeamId}
            onClick={() => onSelectTeam(team.id)}
            className={`h-9 flex-1 rounded-full border text-sm font-bold ${team.id === selectedTeamId ? "border-brand" : ""}`}
          >
            {team.nameHe || team.abbreviation}
          </button>
        ))}
      </div>
      {lineup && (
        <>
          {lineup.valid ? (
            <ul className="mt-3 space-y-1 text-sm">{lineup.onCourt.map(row)}</ul>
          ) : (
            <p className="mt-3 text-xs text-subtle">ההרכב על המגרש אינו זמין כרגע.</p>
          )}
          <button type="button" onClick={onToggleBench} aria-expanded={benchExpanded} className="mt-2 text-xs text-subtle">
            ספסל {benchExpanded ? "▴" : "▾"}
          </button>
          {benchExpanded && <ul className="mt-1 space-y-1 text-sm text-subtle">{(lineup.valid ? lineup.bench : roster).map(row)}</ul>}
        </>
      )}
    </div>
  );
}
