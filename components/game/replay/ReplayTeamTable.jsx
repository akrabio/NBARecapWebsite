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
// - Accessibility (R40): <caption> names the table; column headers show the
//   short label (aria-hidden, with a title tooltip) plus a visually hidden
//   full stat name, so screen readers announce "נקודות", not "נק׳".
// - Sticky header copy (W19): the table scrolls horizontally inside its own
//   container, so a real sticky <thead> cannot pin to the page. An aria-hidden
//   copy of the header row sits in a zero-height sticky anchor below the
//   compact score bar (lib/replay/layout.js stickyHeadTop) and is shown only
//   once the real header has scrolled under that line; its horizontal scroll
//   follows the table's. The card uses overflow: clip (not hidden) so the
//   sticky anchor is not trapped by a scroll container.
// - Footer legend lists this team's unavailable stats by name
//   (lib/replay/messages.js teamGapNotes), not only a "—" marker.

import { useEffect, useRef, useState } from "react";
import TeamLogo from "@/components/ui/TeamLogo";
import { TABLE_COLUMNS, cellValue, columnAvailable } from "@/lib/replay/tables";
import { STICKY_MIN_VIEWPORT_HEIGHT, stickyHeadTop } from "@/lib/replay/layout";
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

function Cols() {
  return (
    <colgroup>
      <col className={styles.nameCol} />
      {TABLE_COLUMNS.map((c) => (
        <col key={c.key} className={styles.statCol} />
      ))}
    </colgroup>
  );
}

/** Column headers: short visible label (title tooltip) + full name for screen readers. */
function HeaderRow({ clone = false }) {
  return (
    <tr>
      <th scope="col" className={`${styles.nameCell} text-start`}>
        שחקן
      </th>
      {TABLE_COLUMNS.map((c) => (
        <th key={c.key} scope="col" className={c.key === "pts" ? styles.ptsCell : undefined} title={c.title}>
          <abbr title={c.title} className="no-underline" aria-hidden={clone ? undefined : "true"}>
            {c.label}
          </abbr>
          {!clone && <span className="sr-only">{c.title}</span>}
        </th>
      ))}
    </tr>
  );
}

/**
 * True while the real header row has scrolled above the sticky-header line
 * (below the compact score bar, or the game tabs on short viewports).
 */
function useHeaderStuck(el) {
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    if (!el || typeof IntersectionObserver === "undefined" || typeof window === "undefined") return undefined;
    let observer = null;
    const media = window.matchMedia?.(`(max-height: ${STICKY_MIN_VIEWPORT_HEIGHT - 1}px)`);
    const observe = () => {
      observer?.disconnect();
      const top = stickyHeadTop(window.innerHeight);
      observer = new IntersectionObserver(
        ([entry]) => setStuck(!entry.isIntersecting && entry.boundingClientRect.top < top && entry.boundingClientRect.height > 0),
        { rootMargin: `-${top}px 0px 0px 0px` },
      );
      observer.observe(el);
    };
    observe();
    media?.addEventListener?.("change", observe);
    return () => {
      media?.removeEventListener?.("change", observe);
      observer?.disconnect();
      setStuck(false);
    };
  }, [el]);
  return stuck;
}

export default function ReplayTeamTable({ team, rows, replay, state, capabilities, cues, benchExpanded, onToggleBench, idPrefix, headingId, gapNotes }) {
  const eventIndex = state.eventIndex;
  const byId = new Map(replay.players.map((p) => [p.id, p]));
  const players = (ids) => ids.map((id) => byId.get(id)).filter(Boolean);
  const onCourt = players(rows.onCourt);
  const others = players(rows.bench);
  const benchId = `${idPrefix}-bench`;
  const anyUnavailable = [...onCourt, ...others].some((p) => TABLE_COLUMNS.some((c) => !columnAvailable(capabilities, c, p, eventIndex)));
  const [theadEl, setTheadEl] = useState(null);
  const stuck = useHeaderStuck(theadEl);
  const scrollRef = useRef(null);
  const cloneRef = useRef(null);
  const syncClone = () => {
    if (cloneRef.current && scrollRef.current) cloneRef.current.scrollLeft = scrollRef.current.scrollLeft;
  };
  // Align the copy when it appears (the table may have been scrolled meanwhile).
  useEffect(() => {
    if (stuck && cloneRef.current && scrollRef.current) cloneRef.current.scrollLeft = scrollRef.current.scrollLeft;
  }, [stuck]);
  const teamName = team.nameHe || team.shortName || team.abbreviation;
  const rowProps = { state, capabilities, eventIndex, cues };

  return (
    <div className="min-w-0 overflow-clip rounded-[18px] border bg-surface">
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
      <div className={styles.headAnchor} aria-hidden="true" inert>
        <div ref={cloneRef} className={`${styles.headClone} ${stuck ? styles.headShown : ""}`}>
          <table className={styles.statTable}>
            <Cols />
            <thead>
              <HeaderRow clone />
            </thead>
          </table>
        </div>
      </div>
      <div ref={scrollRef} onScroll={syncClone} className={styles.statScroll} tabIndex={0} data-replay-scroll="" role="group" aria-label={`טבלת ${teamName}, ניתנת לגלילה אופקית`}>
        <table className={styles.statTable}>
          <caption className="sr-only">
            סטטיסטיקה מצטברת עד הרגע הנוכחי בשחזור · {teamName}
            {rows.fallback ? " (ההרכב על המגרש אינו זמין)" : ""}
          </caption>
          <Cols />
          <thead ref={setTheadEl}>
            <HeaderRow />
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
        שדה / 3נק׳ / עונשין: קליעות/ניסיונות
        {gapNotes?.length > 0 ? (
          <>
            {" · "}
            <span aria-hidden="true">— = </span>לא זמין. {gapNotes.join(" ")}
          </>
        ) : anyUnavailable ? (
          " · — נתון לא זמין למשחק זה"
        ) : null}
      </p>
    </div>
  );
}
