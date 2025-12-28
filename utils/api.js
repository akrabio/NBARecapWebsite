export async function getRecordsByDate(dateString) {
  const response = await fetch(`/api/records/${dateString}`);
  const data = await response.json();
  return data.records;
}

export async function getRecordsByTeam(teamName, limit = 5) {
  const response = await fetch(`/api/records/team/${encodeURIComponent(teamName)}?limit=${limit}`);
  const data = await response.json();
  return data.records;
}

export async function getBoxScore(gameId) {
  const response = await fetch(`/api/boxscore/${gameId}`);
  const data = await response.json();
  return data.boxscore;
}
