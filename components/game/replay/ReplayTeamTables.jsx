// Team stats area (tasks R35–R36): team tabs + one ReplayTeamTable per team.
//
// Selection and bench expansion are owned by ReplayView and passed in;
// switching team only changes which panel is visible — it never touches the
// playback controller (no pause/seek/restart).
//
// layout: 'tabs' (one team at a time, default) | 'both' (side by side, no
// tablist; W18 picks it from the measured container width).
//
// Team tabs (WAI-ARIA tabs, automatic activation): role=tablist labelled
// "קבוצה" (GameView's game-level tablist is "תוכן המשחק", an underline bar
// at the top; team tabs are a segmented control with logos inside the
// replay). Roving tabindex. RTL arrow keys:
// tabs run right-to-left (away first, on the right), so ArrowLeft = next,
// ArrowRight = previous (clamped, like GameView's tabs); Home/End = first/last.
// Arrow/Home/End keydowns are stopped here so GameView's window-level ↑/↓
// sibling-game navigation never fires from inside the tablist.
//
// Cues (forward playback only — small forward steps while playing with no
// jump in between (`jumpGen` from ReplayView); never on mount, seek — even a
// small forward scrub while playing — moment jump or restart):
// - changed cells: weight + outline pulse for a few events;
// - entering players: brief row transition when a substitution group lands;
// - activity: the UNSELECTED team's tab pulses a dot when one of its players
//   records a stat; an sr-only "פעילות חדשה" stays until that tab is selected.
//   Reduced motion: no animation, the dot stays visible (static cue).

import { useId, useRef, useState } from "react";
import TeamLogo from "@/components/ui/TeamLogo";
import { activityTeams, changedCells, enteredPlayers, isNaturalStep, rtlTabIndex, teamRows } from "@/lib/replay/tables";
import { teamGapNotes } from "@/lib/replay/messages";
import ReplayTeamTable from "./ReplayTeamTable";
import styles from "./replay.module.css";

// Events a cell/row emphasis stays applied after the step that caused it.
const CUE_EVENTS = 4;

const keep = (map, eventIndex) => new Map([...map].filter(([, at]) => eventIndex - at <= CUE_EVENTS));

/**
 * Playback cues, updated during render when the event index changes (React's
 * "adjust state on prop change" pattern, like the scoreboard flash).
 */
function useTableCues({ replay, eventIndex, playing, jumpGen = 0, onCourtByTeam, selectedTeamId }) {
  const [track, setTrack] = useState(() => ({
    eventIndex,
    jumpGen,
    selectedTeamId,
    onCourt: onCourtByTeam,
    cells: new Map(),
    entered: new Map(),
    activity: {},
  }));
  let next = track;
  if (track.eventIndex !== eventIndex || track.jumpGen !== jumpGen) {
    // A seek/moment jump/restart (new jumpGen) is never a natural step, even
    // a small forward scrub while playing.
    const natural = track.jumpGen === jumpGen && isNaturalStep(track.eventIndex, eventIndex, playing);
    const cells = natural ? keep(track.cells, eventIndex) : new Map();
    const entered = natural ? keep(track.entered, eventIndex) : new Map();
    const activity = { ...track.activity };
    if (natural) {
      for (const key of changedCells(replay, track.eventIndex, eventIndex, { playing })) cells.set(key, eventIndex);
      for (const [teamId, ids] of Object.entries(onCourtByTeam)) for (const id of enteredPlayers(track.onCourt[teamId], ids)) entered.set(id, eventIndex);
      for (const teamId of activityTeams(replay, track.eventIndex, eventIndex, { playing })) {
        if (teamId === selectedTeamId) continue;
        activity[teamId] = { count: (activity[teamId]?.count ?? 0) + 1, unseen: true };
      }
    }
    next = { ...track, eventIndex, jumpGen, onCourt: onCourtByTeam, cells, entered, activity };
  }
  if (next.selectedTeamId !== selectedTeamId) {
    const activity = { ...next.activity };
    if (activity[selectedTeamId]) activity[selectedTeamId] = { ...activity[selectedTeamId], unseen: false };
    next = { ...next, selectedTeamId, activity };
  }
  if (next !== track) setTrack(next);
  return next;
}

function TeamTab({ team, selected, panelId, tabId, activity, onSelect, tabRef }) {
  const unseen = !selected && activity?.unseen;
  return (
    <button
      ref={tabRef}
      type="button"
      role="tab"
      id={tabId}
      aria-selected={selected}
      aria-controls={panelId}
      tabIndex={selected ? 0 : -1}
      onClick={onSelect}
      className={`${styles.teamTab} flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-[11px] text-[13px] font-bold`}
      style={{ "--c": team.uiColor }}
    >
      <TeamLogo teamName={team.siteName} hebrewName={team.nameHe} alt="" size="xs" className="!h-[22px] !w-[22px]" />
      <span className="truncate">{team.nameHe || team.shortName || team.abbreviation}</span>
      <span
        key={activity?.count ?? 0}
        aria-hidden="true"
        className={`${styles.activityDot} ${unseen ? styles.activityPulse : ""}`}
        data-unseen={unseen ? "true" : "false"}
      />
      {unseen && <span className="sr-only">פעילות חדשה</span>}
    </button>
  );
}

export default function ReplayTeamTables({
  frame,
  replay,
  teams,
  capabilities,
  selectedTeamId,
  onSelectTeam,
  benchExpanded,
  onToggleBench,
  playing = false,
  jumpGen = 0,
  layout = "tabs",
  gaps = null,
}) {
  const prefix = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const order = [teams.away, teams.home];
  const state = frame.state;
  const rowsByTeam = Object.fromEntries(order.map((t) => [t.id, teamRows(replay, state, t.id, capabilities)]));
  const onCourtByTeam = Object.fromEntries(order.map((t) => [t.id, rowsByTeam[t.id].onCourt]));
  const cues = useTableCues({ replay, eventIndex: frame.frame.eventIndex, playing, jumpGen, onCourtByTeam, selectedTeamId });
  const tabRefs = useRef({});
  const tabs = layout !== "both";
  const ids = (team) => ({ tabId: `${prefix}-team-tab-${team.id}`, panelId: `${prefix}-team-panel-${team.id}`, headingId: `${prefix}-team-heading-${team.id}` });

  const onTabsKeyDown = (e) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) return;
    // Keep team-tab keys away from GameView's window-level handlers.
    e.stopPropagation();
    // ↑/↓ do nothing in a horizontal tablist; don't let them scroll the page either.
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      return;
    }
    const current = Math.max(0, order.findIndex((t) => t.id === selectedTeamId));
    const index = rtlTabIndex(e.key, current, order.length);
    if (index == null) return;
    e.preventDefault();
    const team = order[index];
    if (team.id !== selectedTeamId) onSelectTeam(team.id);
    tabRefs.current[team.id]?.focus();
  };

  const table = (team) => (
    <ReplayTeamTable
      team={team}
      rows={rowsByTeam[team.id]}
      replay={replay}
      state={state}
      capabilities={capabilities}
      cues={cues}
      benchExpanded={benchExpanded}
      onToggleBench={onToggleBench}
      idPrefix={`${prefix}-${team.id}`}
      headingId={ids(team).headingId}
      gapNotes={teamGapNotes(gaps, team.id)}
    />
  );

  return (
    <div className="mt-5" data-layout={layout}>
      {tabs ? (
        <>
          <div role="tablist" aria-label="קבוצה" className={`${styles.teamTabs} mb-2.5 flex gap-1 rounded-[14px] p-1`} onKeyDown={onTabsKeyDown}>
            {order.map((team) => (
              <TeamTab
                key={team.id}
                team={team}
                {...ids(team)}
                selected={team.id === selectedTeamId}
                activity={cues.activity[team.id]}
                onSelect={() => onSelectTeam(team.id)}
                tabRef={(el) => {
                  tabRefs.current[team.id] = el;
                }}
              />
            ))}
          </div>
          {order.map((team) => (
            <div key={team.id} role="tabpanel" id={ids(team).panelId} aria-labelledby={ids(team).tabId} hidden={team.id !== selectedTeamId}>
              {team.id === selectedTeamId && table(team)}
            </div>
          ))}
        </>
      ) : (
        <div className="grid grid-cols-2 gap-3.5">
          {order.map((team) => (
            <section key={team.id} aria-labelledby={ids(team).headingId} className="min-w-0">
              {table(team)}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
