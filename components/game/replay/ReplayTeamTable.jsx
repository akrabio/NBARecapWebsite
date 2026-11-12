// One team's running stats table (task R35).
//
// Semantic <table>: the on-court five in stable slot order (an entering
// player takes the leaving player's slot), then a collapsible bench section
// with everyone else and their accumulated stats. Rows are never sorted by
// points. Player name + PTS are sticky inside the horizontally scrolling
// container (the page itself never scrolls sideways).
//
// - Unavailable families → "—" + accessible "לא זמין", distinct from a
//   supported 0 (which is shown, dimmed).
// - Roster fallback (invalid lineup): labelled "הרכב על המגרש אינו זמין",
//   the whole team listed, never described as on court.
// - Emphasis (passed in from ReplayTeamTables, forward playback only): changed
//   cells get a weight + outline pulse, entering players a brief row
//   transition; both off under reduced motion (static weight instead).
// - DNP flags are never shown (final box-score data; would leak pre-tip).

import TeamLogo from "@/components/ui/TeamLogo";
import { TABLE_COLUMNS, cellValue, columnAvailable } from "@/lib/replay/tables";
import styles from "./replay.module.css";

const COLSPAN = TABLE_COLUMNS.length + 1;

function Cell({ column, value, changedAt }) {
  const pts = column.key === "pts";
  const className = [pts ? styles.ptsCell : "", value.zero ? "text-faint" : "", "px-1 text-center"].join(" ");
  if (value.unavailable) {
    return (
      <td className={`${className} text-faint`} title="לא זמין">
        <span aria-hidden="true">—</span>
        <span className="sr-only">לא זמין</span>
      </td>
    );
  }
  return (
    // dir on the inner span, not the cell: a dir="ltr" cell would flip its
    // own sticky inset-inline-start to the left edge.
    <td className={className}>
      <span key={changedAt ?? "static"} dir="ltr" className={changedAt != null ? styles.cellChanged : undefined}>
        {value.text}
      </span>
    </td>
  );
}

function PlayerRow({ player, state, capabilities, eventIndex, cues, muted }) {
  const row = state.players?.[player.id];
  const entered = cues.entered.has(player.id);
  return (
    <tr className={`${entered ? styles.rowEntered : ""} ${muted ? "text-subtle" : ""}`} data-player-id={player.id}>
      <th scope="row" className={`${styles.nameCell} text-start font-semibold`} title={player.name}>
        <span className="block truncate">
          <bdi>{player.shortName || player.name}</bdi>
        </span>
      </th>
      {TABLE_COLUMNS.map((column) => (
        <Cell
          key={column.key}
          column={column}
          value={cellValue(row, column, columnAvailable(capabilities, column, player, eventIndex))}
          changedAt={cues.cells.get(`${player.id}:${column.key}`)}
        />
      ))}
    </tr>
  );
}

function SectionRow({ children }) {
  return (
    <tr className={styles.sectionRow}>
      <th colSpan={COLSPAN} scope="colgroup" className="p-0 text-start">
        <div className={styles.sectionLabel}>{children}</div>
      </th>
    </tr>
  );
}

export default function ReplayTeamTable({ team, rows, replay, state, capabilities, cues, benchExpanded, onToggleBench, idPrefix, headingId }) {
  const eventIndex = state.eventIndex;
  const byId = new Map(replay.players.map((p) => [p.id, p]));
  const players = (ids) => ids.map((id) => byId.get(id)).filter(Boolean);
  const onCourt = players(rows.onCourt);
  const others = players(rows.bench);
  const benchId = `${idPrefix}-bench`;
  const anyUnavailable = [...onCourt, ...others].some((p) => TABLE_COLUMNS.some((c) => !columnAvailable(capabilities, c, p, eventIndex)));
  const teamName = team.nameHe || team.shortName || team.abbreviation;
  const rowProps = { state, capabilities, eventIndex, cues };

  return (
    <div className="min-w-0 overflow-hidden rounded-[18px] border bg-surface">
      <div className="flex items-center gap-2 border-b px-3.5 pt-3 pb-2.5">
        <TeamLogo teamName={team.siteName} hebrewName={team.nameHe} alt="" size="xs" className="!h-6 !w-6" />
        <h3 id={headingId} className="text-[14px] font-extrabold">
          {teamName}
        </h3>
        {rows.pendingSubs.length > 0 && (
          <span className="rounded-full border px-2 text-[10.5px] font-bold text-subtle" title="חילוף בתהליך">
            חילוף
          </span>
        )}
        <small className="ms-auto text-[11px] text-subtle">{rows.fallback ? "הרכב על המגרש אינו זמין" : "על המגרש"}</small>
      </div>
      <div className={styles.statScroll} tabIndex={0} data-replay-scroll="" role="group" aria-label={`טבלת ${teamName}, ניתנת לגלילה אופקית`}>
        <table className={styles.statTable} aria-label={`סטטיסטיקה מצטברת · ${teamName}`}>
          <colgroup>
            <col className={styles.nameCol} />
            {TABLE_COLUMNS.map((c) => (
              <col key={c.key} className={styles.statCol} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th scope="col" className={`${styles.nameCell} text-start`}>
                שחקן
              </th>
              {TABLE_COLUMNS.map((c) => (
                <th key={c.key} scope="col" className={c.key === "pts" ? styles.ptsCell : undefined} title={c.title}>
                  <abbr title={c.title} className="no-underline">
                    {c.label}
                  </abbr>
                </th>
              ))}
            </tr>
          </thead>
          {rows.fallback ? (
            <tbody>
              <SectionRow>סגל הקבוצה (ההרכב על המגרש אינו זמין)</SectionRow>
              {others.map((p) => (
                <PlayerRow key={p.id} player={p} {...rowProps} />
              ))}
            </tbody>
          ) : (
            <>
              <tbody>
                {onCourt.map((p) => (
                  <PlayerRow key={p.id} player={p} {...rowProps} />
                ))}
              </tbody>
              {others.length > 0 && (
                <tbody>
                  <SectionRow>
                    <button type="button" className={styles.benchToggle} aria-expanded={benchExpanded} aria-controls={benchId} onClick={onToggleBench}>
                      ספסל ({others.length}) <span aria-hidden="true">{benchExpanded ? "▴" : "▾"}</span>
                    </button>
                  </SectionRow>
                </tbody>
              )}
              <tbody id={benchId} hidden={!benchExpanded}>
                {benchExpanded && others.map((p) => <PlayerRow key={p.id} player={p} {...rowProps} muted />)}
              </tbody>
            </>
          )}
        </table>
      </div>
      <p className="border-t px-3.5 py-2 text-[10.5px] text-subtle">
        שדה / 3נק׳ / עונשין: קליעות/ניסיונות{anyUnavailable ? " · — נתון לא זמין למשחק זה" : ""}
      </p>
    </div>
  );
}
