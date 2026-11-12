"use client";

// Replay tab content (tasks R29, R31).
//
// Demand-loaded by GameView (next/dynamic) the first time the replay tab is
// selected, then kept mounted (hidden + inert) while another tab is shown, so
// position/speed survive tab returns. GameView keys it by game id, so a game
// change discards all replay state. `active` = replay tab selected; inactive
// pauses playback (useReplayPlayback). Data is fetched once per game via
// useReplayData — never per frame.
//
// One controller (R31): useReplayPlayback owns the clock; every render derives
// ONE frame (lib/replay/frame.js) from its position and hands that same object
// to every subview, so scoreboard, probability, spotlight, controls and tables
// always show the same event index. State reconstruction is memoized by
// eventIndex (and the spotlight's own eventIndex), so 60 fps ticks only
// recompute the cheap time fields. Scoreboard, probability, spotlight and
// controls (W16) sit in one broadcast panel; team tables follow (W17).
//
// Layout (R37): GameView gives the replay panel up to 1100px. The team tables
// are side by side ('both') when the replay container's own content width
// (ResizeObserver) is ≥ BOTH_MIN_WIDTH (lib/replay/layout.js), else one-team
// tabs. A compact sticky score bar (score, clock, play/pause) appears under
// the site's top bar + game tabs once the broadcast panel scrolls away, so
// the running score stays visible beside the player rows; hidden by CSS on
// viewports shorter than STICKY_MIN_VIEWPORT_HEIGHT (520px).
//
// Keyboard (R38, lib/replay/keyboard.js): Space/K play-pause, ←/→ next/previous
// key moment, only while focus is inside this view (its root is focusable).
// Seeks/restarts bump `jumpGen` so score flashes and tab activity cues fire
// only on natural playback ticks, never on a scrub while playing.
//
// Owned here (game-local, reset by the game-id key): selected stats team
// (default chosen once: involved favorite, else home) and bench expansion.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pause, Play } from "lucide-react";
import TeamLogo from "@/components/ui/TeamLogo";
import { useTeamPicker } from "@/components/games/TeamPicker";
import { useReplayData } from "@/utils/replay-api";
import { createFrameDeriver, defaultTeamId } from "@/lib/replay/frame";
import { useReplayPlayback } from "./useReplayPlayback";
import ReplayScoreboard from "./ReplayScoreboard";
import ReplayProbability from "./ReplayProbability";
import ReplaySpotlight from "./ReplaySpotlight";
import ReplayControls from "./ReplayControls";
import ReplayTeamTables from "./ReplayTeamTables";
import { matchupColors } from "@/utils/teamColors";
import { gameClockStatus, momentTeamId, panelColor, probabilityAvailable } from "@/lib/replay/display";
import { STICKY_TOP, tableLayoutFor } from "@/lib/replay/layout";
import { keyTargetKind, replayShortcut } from "@/lib/replay/keyboard";
import { replayStateAt } from "@/lib/replay/client-state";
import styles from "./replay.module.css";

const UNAVAILABLE_TEXT = {
  no_espn_id: "לא נמצאו נתוני מהלכים למשחק הזה.",
  unknown_event: "לא נמצאו נתוני מהלכים למשחק הזה.",
  invalid_id: "מזהה המשחק אינו תקין.",
  game_not_final: "השחזור יהיה זמין לאחר סיום המשחק.",
};
const DEFAULT_UNAVAILABLE = "אין מספיק נתונים אמינים לשחזור המשחק.";

function Message({ children, actions }) {
  return (
    <div className="py-10 text-center" role="status">
      <p className="text-[15px] text-body">{children}</p>
      {actions && <div className="mt-4 flex justify-center gap-2">{actions}</div>}
    </div>
  );
}

const buttonClass = "h-10 rounded-full border px-4 text-sm font-bold";

/** The single frame for this render: cheap time fields per tick, state memoized by event index. */
function useReplayFrame(replay, positionSec) {
  const derive = useMemo(() => createFrameDeriver(replay), [replay]);
  return derive(positionSec);
}

function ReplayEnd({ onReplay, onSelectTab }) {
  return (
    <div className="mt-4 flex justify-center gap-2">
      <button type="button" onClick={onReplay} className={buttonClass}>
        צפייה חוזרת
      </button>
      <button type="button" onClick={() => onSelectTab?.("recap")} className={buttonClass}>
        לסיכום המלא
      </button>
    </div>
  );
}

/**
 * Display teams for the broadcast subviews: payload team + the site's DB team
 * name (logo lookup) and the site's matchup colors (distinct for the pair).
 */
function useDisplayTeams(replay, game) {
  return useMemo(() => {
    const colors = matchupColors(game.away_team, game.home_team);
    // Lifted for contrast on the dark broadcast panel (bar, dots, accents).
    const away = { ...replay.teams.away, siteName: game.away_team, uiColor: panelColor(colors.away) };
    const home = { ...replay.teams.home, siteName: game.home_team, uiColor: panelColor(colors.home) };
    return { away, home };
  }, [replay, game.away_team, game.home_team]);
}

/** Measured content width of an element (0 while hidden/unmounted). */
function useContentWidth(el) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);
  return width;
}

/** True once `el` has scrolled up under the sticky site header. */
function useScrolledPast(el) {
  const [past, setPast] = useState(false);
  useEffect(() => {
    if (!el || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => setPast(!entry.isIntersecting && entry.boundingClientRect.bottom <= STICKY_TOP),
      { rootMargin: `-${STICKY_TOP}px 0px 0px 0px` },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      setPast(false);
    };
  }, [el]);
  return past;
}

function StickyScore({ frame, teams, playing, ended, onToggle, regulationPeriods, shown }) {
  const status = gameClockStatus(frame, regulationPeriods);
  const score = { home: frame.state.score?.home ?? 0, away: frame.state.score?.away ?? 0 };
  const label = playing ? "השהיה" : "הפעלה";
  const side = (team, value) => (
    <span className="flex min-w-0 items-center gap-1.5">
      <TeamLogo teamName={team.siteName} hebrewName={team.nameHe} alt="" size="xs" className="!h-6 !w-6 shrink-0" />
      <bdi dir="ltr" className="text-[12px] text-subtle">{team.abbreviation}</bdi>
      <b className="text-[19px] leading-none font-black tabular-nums">{value}</b>
    </span>
  );
  return (
    // Zero-height sticky anchor: the bar overlays the tables' top instead of
    // reserving space while the full scoreboard is still on screen.
    <div className={styles.stickyAnchor} style={{ top: STICKY_TOP }} aria-hidden={!shown} inert={!shown}>
      <div
        className={`${styles.broadcast} ${styles.stickyBar} ${shown ? styles.stickyShown : ""} flex h-11 items-center justify-between gap-2 rounded-b-[14px] px-3`}
        style={{ "--away-c": teams.away.uiColor, "--home-c": teams.home.uiColor }}
      >
        {side(teams.away, score.away)}
        <span className="flex items-center gap-2 text-[12px] font-bold tabular-nums">
          <span className={status.phase === "live" ? "text-brand" : "text-subtle"}>{status.label}</span>
          {status.clock && <bdi dir="ltr">{status.clock}</bdi>}
          {!ended && (
            <button type="button" onClick={onToggle} aria-label={label} title={label} className="grid h-8 w-8 place-items-center rounded-full bg-brand text-on-brand">
              {playing ? <Pause className="h-4 w-4" fill="currentColor" aria-hidden="true" /> : <Play className="h-4 w-4" fill="currentColor" aria-hidden="true" />}
            </button>
          )}
        </span>
        {side(teams.home, score.home)}
      </div>
    </div>
  );
}

function ReadyReplay({ result, game, active, limited, onSelectTab, selectedTeamId, onSelectTeam, benchExpanded, onToggleBench }) {
  const { replay, espnGameId, capabilities } = result;
  const teams = useDisplayTeams(replay, game);
  const regulationPeriods = replay.format?.regulationPeriods ?? 4;
  const hasProbability = useMemo(() => probabilityAvailable(replay, capabilities), [replay, capabilities]);
  // Moment marker color = the moment's (first) team, by highlight id.
  const teamColorById = useMemo(() => {
    const byHighlight = new Map();
    for (const h of replay.highlights ?? []) {
      // game_end winner from the final state (the moment is the last event).
      const score = h.type === "game_end" ? replayStateAt(replay, h.eventIndex).score : null;
      const teamId = momentTeamId(h, { players: replay.players, teams, score });
      byHighlight.set(h.id, teamId === teams.home.id ? teams.home.uiColor : teamId === teams.away.id ? teams.away.uiColor : null);
    }
    return (id) => byHighlight.get(id) ?? null;
  }, [replay, teams]);
  const { snapshot, containerRef, play, pause, toggle, seek, setSpeed, restart } = useReplayPlayback({
    gameKey: espnGameId,
    durationSec: replay.timeline.durationSec,
    active,
  });
  // Jumps (seek / moment nav / restart) bump the generation: cues compare it
  // so only natural playback ticks flash scores or pulse team tabs.
  const [jumpGen, setJumpGen] = useState(0);
  const actions = useMemo(
    () => ({
      play,
      pause,
      toggle,
      setSpeed,
      seek: (sec) => {
        setJumpGen((g) => g + 1);
        seek(sec);
      },
      restart: () => {
        setJumpGen((g) => g + 1);
        restart();
      },
    }),
    [play, pause, toggle, seek, setSpeed, restart],
  );
  const frame = useReplayFrame(replay, snapshot.positionSec);
  const ended = snapshot.ended || frame.frame.ended;

  // One element: playback's zero-size (hidden preview) check + layout width.
  const [rootEl, setRootEl] = useState(null);
  const rootRef = useCallback(
    (node) => {
      containerRef(node);
      setRootEl(node);
    },
    [containerRef],
  );
  const width = useContentWidth(rootEl);
  // Keep the last real layout while hidden (width 0).
  const [tableLayout, setTableLayout] = useState("tabs");
  const nextLayout = tableLayoutFor(width, tableLayout);
  if (nextLayout !== tableLayout) setTableLayout(nextLayout);

  const [panelEl, setPanelEl] = useState(null);
  const panelPast = useScrolledPast(panelEl);

  const replayAgain = () => {
    actions.restart();
    actions.play();
  };
  const togglePlay = ended ? replayAgain : actions.toggle;

  const onKeyDown = (e) => {
    const action = replayShortcut({
      key: e.key,
      code: e.code,
      altKey: e.altKey,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
      defaultPrevented: e.defaultPrevented,
      targetKind: keyTargetKind(e.target),
    });
    if (!action) return;
    e.preventDefault();
    if (action === "toggle") togglePlay();
    else if (action === "next" && frame.nav.next) actions.seek(frame.nav.next.sec);
    else if (action === "prev" && frame.nav.prev) actions.seek(frame.nav.prev.sec);
  };

  return (
    // Focusable root (tabIndex -1: click focus only) so shortcuts work after
    // clicking anywhere in the replay; keys are handled only from inside it.
    <div ref={rootRef} tabIndex={-1} onKeyDown={onKeyDown} className="py-4 outline-none" data-event-index={frame.frame.eventIndex} data-table-layout={tableLayout}>
      {/* Broadcast panel, mockup order: scoreboard → probability → spotlight → controls. */}
      <section
        ref={setPanelEl}
        className={`${styles.broadcast} overflow-hidden rounded-[22px] shadow-[0_12px_30px_#00000014] max-[520px]:rounded-[18px]`}
        style={{ "--away-c": teams.away.uiColor, "--home-c": teams.home.uiColor }}
        aria-label="שחזור המשחק"
      >
        <ReplayScoreboard frame={frame} teams={teams} playing={snapshot.playing} jumpGen={jumpGen} regulationPeriods={regulationPeriods} />
        <ReplayProbability frame={frame} teams={teams} timeline={replay.timeline} available={hasProbability} regulationPeriods={regulationPeriods} />
        <ReplaySpotlight frame={frame} replay={replay} teams={teams} capabilities={capabilities} regulationPeriods={regulationPeriods} />
        <ReplayControls
          frame={frame}
          playback={snapshot}
          actions={actions}
          timeline={replay.timeline}
          teamColorById={teamColorById}
          regulationPeriods={regulationPeriods}
        />
      </section>
      {limited && <p className="mt-2 text-center text-xs text-subtle">נתונים חלקיים: חלק מהסטטיסטיקות אינן זמינות למשחק זה.</p>}
      {ended && <ReplayEnd onReplay={replayAgain} onSelectTab={onSelectTab} />}
      <StickyScore
        frame={frame}
        teams={teams}
        playing={snapshot.playing}
        ended={ended}
        onToggle={togglePlay}
        regulationPeriods={regulationPeriods}
        shown={panelPast && active}
      />
      <ReplayTeamTables
        frame={frame}
        replay={replay}
        teams={teams}
        capabilities={capabilities}
        playing={snapshot.playing}
        jumpGen={jumpGen}
        layout={tableLayout}
        selectedTeamId={selectedTeamId}
        onSelectTeam={onSelectTeam}
        benchExpanded={benchExpanded}
        onToggleBench={onToggleBench}
      />
    </div>
  );
}

export default function ReplayView({ game, active = false, onSelectTab }) {
  const { state, data, reasons, retry } = useReplayData(game.espn_game_id, { enabled: true });
  // Favorite team from the existing picker context (no new preference store).
  const { favorite } = useTeamPicker();
  const replay = state === "ready" || state === "limited" ? data?.replay : null;
  // Chosen once per game, when the payload first arrives; later renders
  // (favorite changes, data refreshes) never reset a manual selection.
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  if (replay && selectedTeamId == null) setSelectedTeamId(defaultTeamId(replay, { favorite, awayTeam: game.away_team }));
  const [benchExpanded, setBenchExpanded] = useState(false);

  if (state === "idle" || state === "loading") return <ReplayLoading />;

  if (state === "error") {
    return (
      <Message
        actions={
          <button type="button" onClick={retry} className={buttonClass}>
            נסו שוב
          </button>
        }
      >
        לא ניתן לטעון את השחזור כרגע.
      </Message>
    );
  }

  if (state === "unavailable" || !replay) {
    const reason = reasons?.[0];
    return (
      <Message
        actions={
          <>
            <button type="button" onClick={() => onSelectTab?.("recap")} className={buttonClass}>
              לסיכום
            </button>
            <button type="button" onClick={() => onSelectTab?.("box")} className={buttonClass}>
              לנתונים
            </button>
          </>
        }
      >
        <span data-reason={reason}>{UNAVAILABLE_TEXT[reason] || DEFAULT_UNAVAILABLE}</span>
      </Message>
    );
  }

  return (
    <ReadyReplay
      result={data}
      game={game}
      active={active}
      limited={state === "limited"}
      onSelectTab={onSelectTab}
      selectedTeamId={selectedTeamId}
      onSelectTeam={setSelectedTeamId}
      benchExpanded={benchExpanded}
      onToggleBench={() => setBenchExpanded((open) => !open)}
    />
  );
}

export function ReplayLoading() {
  return <Message>טוען שחזור…</Message>;
}
