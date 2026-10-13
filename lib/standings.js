// Conference standings, saved once per night (collection standings_snapshots)
// so the site can show where teams stand and who moved. No imports, so the
// recap pipeline can build snapshots with the same code.

// ESPN's standings API: site.api.espn.com/apis/v2/sports/basketball/nba/standings
// → { date, east: [{ team, w, l, streak }, ...], west: [...] }, each in seed order.
export function buildStandingsSnapshot(espnStandings, date) {
  const conference = (abbreviation) => {
    const group = (espnStandings?.children || []).find((c) => c.abbreviation === abbreviation);
    return (group?.standings?.entries || [])
      .map((entry) => {
        const stat = (name) => entry.stats?.find((s) => s.name === name);
        return {
          team: entry.team?.displayName,
          seed: Number(stat("playoffSeed")?.value) || 99,
          w: Number(stat("wins")?.value) || 0,
          l: Number(stat("losses")?.value) || 0,
          streak: stat("streak")?.displayValue || null,
        };
      })
      .filter((row) => row.team)
      .sort((a, b) => a.seed - b.seed)
      .map(({ team, w, l, streak }) => ({ team, w, l, streak }));
  };
  const east = conference("East");
  const west = conference("West");
  return east.length && west.length ? { date, east, west } : null;
}

// Each team's place, and its place in the previous snapshot:
// { "Miami Heat": { conf: "E", rank: 6, prevRank: 7, w: 37, l: 29, streak: "W6" }, ... }
export function standingsByTeam(current, previous) {
  if (!current) return {};
  const ranks = (snapshot) =>
    Object.fromEntries(
      ["east", "west"].flatMap((key) => (snapshot?.[key] || []).map((row, i) => [row.team, i + 1]))
    );
  const before = ranks(previous);
  return Object.fromEntries(
    ["east", "west"].flatMap((key) =>
      current[key].map((row, i) => [
        row.team,
        { conf: key === "east" ? "E" : "W", rank: i + 1, prevRank: before[row.team] ?? null, w: row.w, l: row.l, streak: row.streak },
      ])
    )
  );
}

// Teams whose place changed, best first, per conference
export function standingsMoves(byTeam) {
  const moved = Object.entries(byTeam)
    .filter(([, s]) => s.prevRank && s.prevRank !== s.rank)
    .map(([team, s]) => ({ team, ...s }))
    .sort((a, b) => a.rank - b.rank);
  return { east: moved.filter((m) => m.conf === "E"), west: moved.filter((m) => m.conf === "W") };
}
