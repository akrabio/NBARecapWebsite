import { extractSeriesRecord } from "@/utils/gameUtils";

// The recap `content` field looks like:
//   **<home> (62-20) 95 – 105 <away> (53-29) | סדרה: 0-0**
//   <~5 long paragraphs>
//   <two markdown stat tables: Starters / Bench / Team / top players>
// The bold first line repeats the scoreboard, so it is pulled out as `header`.

const RECORD_RE = /\(\d+[-‐-―]\d+\)/;

function parseTable(block) {
  const rows = block
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !/^\|\s*:?-/.test(line))
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()));
  return { head: rows[0] || [], rows: rows.slice(1) };
}

export function parseRecap(content = "") {
  const recap = { header: null, series: null, blocks: [], tables: [] };
  const parts = content.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);

  for (const part of parts) {
    const isTable = part.split("\n").every((line) => line.trim().startsWith("|"));
    if (isTable) {
      recap.tables.push(parseTable(part));
      recap.blocks.push({ type: "table", index: recap.tables.length - 1 });
    } else if (!recap.header && recap.blocks.length === 0 && part.startsWith("**") && RECORD_RE.test(part)) {
      recap.header = part.replace(/\*+/g, "").trim();
      recap.series = extractSeriesRecord(part);
    } else {
      recap.blocks.push({ type: "text", text: part });
    }
  }
  return recap;
}

// First real paragraph, stripped of markdown, for list snippets.
export function getSnippet(content) {
  const block = parseRecap(content).blocks.find(
    (b) => b.type === "text" && !b.text.startsWith("#") && b.text.replace(/[*_`#]/g, "").trim().length > 30
  );
  return block ? block.text.replace(/[*_`#]/g, "").trim() : null;
}

export function getReadingMinutes(content = "") {
  return Math.max(1, Math.round(content.split(/\s+/).length / 200));
}

// Stat table formats vary between recaps: the first header cell may be blank,
// "Team", "TEAM" or "Role"; row labels may be "Team" or "Team (NYK)"; and the
// columns differ. Compare labels without the parenthetical, case-insensitively.
const SUMMARY_ROWS = ["starters", "bench", "team"];
const rowKey = (label = "") => label.replace(/\s*\(.*\)\s*$/, "").trim().toLowerCase();
const columnIndex = (table, column) => table.head.findIndex((h) => h.toUpperCase() === column.toUpperCase());

export function tableValue(table, rowLabel, column) {
  const row = table.rows.find((r) => rowKey(r[0]) === rowLabel.toLowerCase());
  const col = columnIndex(table, column);
  return row && col > 0 ? Number(row[col]) : NaN;
}

export function tableCell(table, row, column) {
  const col = columnIndex(table, column);
  return col > 0 ? row[col] : null;
}

export function tablePlayers(table) {
  return table.rows.filter((row) => !SUMMARY_ROWS.includes(rowKey(row[0])));
}

// The stat tables don't say (reliably) which team they belong to; match each
// one by its "Team" row points against the final score.
export function matchTablesToTeams(game, tables) {
  const byTeam = {};
  for (const table of tables) {
    const pts = tableValue(table, "Team", "PTS");
    if (Number.isNaN(pts)) continue;
    if (pts === game.home_score && !byTeam.home) byTeam.home = table;
    else if (pts === game.away_score && !byTeam.away) byTeam.away = table;
  }
  return byTeam.home && byTeam.away ? byTeam : null;
}
