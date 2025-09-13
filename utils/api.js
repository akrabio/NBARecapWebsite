export async function getRecordsByDate(dateString) {
  const response = await fetch(`/api/records/${dateString}`);
  const data = await response.json();
  return data.records;
}
