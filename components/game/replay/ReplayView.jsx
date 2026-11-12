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
import { LOADING_SLOW_MS, capabilityGaps, errorMessage, reachedMoments, unavailableMessage } from "@/lib/replay/messages";
import { CaptionText } from "./ReplaySpotlight";
import styles from "./replay.module.css";

/** State message (loading fallback / failure / unavailable): title, explanation, actions. */
function Message({ title, children, actions, reason, role = "status" }) {
  return (
    <div className={`${styles.replayRoot} py-10 text-center`} role={role} data-replay-state={reason ?? undefined}>
      {title && <p className="text-[16px] font-extrabold text-ink">{title}</p>}
      <p className="mx-auto mt-1 max-w-[440px] text-[14.5px] text-body">{children}</p>
      {actions && <div className="mt-4 flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  );
}

/** Recap / stats buttons: an unavailable replay is never a dead end. */
function OtherTabs({ onSelectTab }) {
  return (
    <>
      <button type="button" onClick={() => onSelectTab?.("recap")} className={buttonClass}>
        לסיכום המשחק
      </button>
      <button type="button" onClick={() => onSelectTab?.("box")} className={buttonClass}>
        לנתוני המשחק
      </button>
    </>
  );
}

const buttonClass = "min-h-10 rounded-full border px-4 text-sm font-bold";

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
          {/* "רבע 1" must not break between word and number at 320px; longer end/pre labels may wrap. */}
          <span className={status.phase === "live" ? "text-brand whitespace-nowrap" : "text-subtle text-center leading-tight"}>{status.label}</span>
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

/**
 * Limited-replay banner (R39): what this replay cannot show, from the
 * payload's capabilities only (never from game.story). Text, not color.
 */
function ReplayLimits({ gaps, limited }) {
  if (!gaps.any && !limited) return null;
  return (
    <aside className="mb-3 rounded-[14px] border bg-surface-2 px-3.5 py-2.5 text-[12.5px] text-body" aria-label="מגבלות הנתונים בשחזור">
      <p className="font-extrabold text-ink">שחזור חלקי</p>
      {gaps.any ? (
        <ul className="mt-0.5 list-disc ps-4">
          {gaps.items.map((item) => (
            <li key={`${item.kind}-${item.family}-${item.scope}-${item.teamIds.join("-")}`}>{item.text}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-0.5">חלק מהנתונים במשחק הזה מוגבלים; ערכים שלא ניתן לאמת מסומנים ב־—.</p>
      )}
    </aside>
  );
}

/**
 * Accessible moment history (R40): captions of moments already reached, each
 * a button seeking to that moment. Future moments are never listed (the
 * previous/next controls may still seek forward intentionally).
 */
function MomentHistory({ replay, frame, onSeek }) {
  // Keyed by the last reached moment's start (not the per-tick position), so
  // the list is rebuilt only when a new moment is reached or left behind.
  const reachedSec = frame.spotlight ? (replay.timeline.moments?.[frame.spotlight.momentIndex]?.startSec ?? frame.sec) : 0;
  const moments = useMemo(() => reachedMoments(replay, reachedSec), [replay, reachedSec]);
  const current = frame.spotlight?.momentIndex;
  return (
    <details className={`${styles.momentList} border-t border-[#283143] px-4 py-2 max-[520px]:px-3`}>
      <summary className="min-h-9 cursor-pointer py-1.5 text-[12px] font-bold text-body">
        רגעי מפתח עד כה ({moments.length})
      </summary>
      {moments.length === 0 ? (
        <p className="pb-2 text-[12px] text-subtle">עוד לא הגענו לרגע מפתח. רגעים יתווספו כאן במהלך השחזור.</p>
      ) : (
        <ol className="flex flex-col gap-0.5 pb-1.5">
          {moments.map((m) => (
            <li key={m.highlightId}>
              <button
                type="button"
                onClick={() => onSeek(m.sec)}
                aria-current={m.momentIndex === current ? "true" : undefined}
                className="flex w-full items-baseline gap-2 rounded-lg px-2 py-1.5 text-start text-[12.5px] text-body hover:bg-white/5"
              >
                <span className="flex-none text-[11px] text-subtle tabular-nums">
                  {m.period}
                  {m.clock ? (
                    <>
                      {" "}
                      <bdi dir="ltr">{m.clock}</bdi>
                    </>
                  ) : null}
                </span>
                <span className="min-w-0">
                  <CaptionText caption={m.caption} />
                </span>
                {m.momentIndex === current && <span className="ms-auto flex-none text-[10.5px] font-bold text-brand">· נוכחי</span>}
              </button>
            </li>
          ))}
        </ol>
      )}
    </details>
  );
}

function ReadyReplay({ result, game, active, limited, onSelectTab, selectedTeamId, onSelectTeam, benchExpanded, onToggleBench }) {
  const { replay, espnGameId, capabilities } = result;
  const teams = useDisplayTeams(replay, game);
  const regulationPeriods = replay.format?.regulationPeriods ?? 4;
  const hasProbability = useMemo(() => probabilityAvailable(replay, capabilities), [replay, capabilities]);
  const gaps = useMemo(() => capabilityGaps(replay, capabilities), [replay, capabilities]);
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
    <div ref={rootRef} tabIndex={-1} onKeyDown={onKeyDown} className={`${styles.replayRoot} py-4 outline-none`} data-event-index={frame.frame.eventIndex} data-table-layout={tableLayout}>
      <ReplayLimits gaps={gaps} limited={limited} />
      {/* Broadcast panel, mockup order: scoreboard → probability → spotlight → controls → reached moments. */}
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
        <MomentHistory replay={replay} frame={frame} onSeek={actions.seek} />
      </section>
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
        gaps={gaps}
      />
    </div>
  );
}

export default function ReplayView({ game, active = false, onSelectTab }) {
  // No resolved ESPN id → the hook returns `unavailable` / no_espn_id without
  // any request. Support is decided only by the replay payload, never by
  // whether the game has a written story.
  const { state, data, error, reasons, retry } = useReplayData(game.espn_game_id, { enabled: true });
  const [loadGen, setLoadGen] = useState(0);
  const retryLoad = useCallback(() => {
    setLoadGen((n) => n + 1);
    retry();
  }, [retry]);
  // Favorite team from the existing picker context (no new preference store).
  const { favorite } = useTeamPicker();
  const replay = state === "ready" || state === "limited" ? data?.replay : null;
  // Chosen once per game, when the payload first arrives; later renders
  // (favorite changes, data refreshes) never reset a manual selection.
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  if (replay && selectedTeamId == null) setSelectedTeamId(defaultTeamId(replay, { favorite, awayTeam: game.away_team }));
  const [benchExpanded, setBenchExpanded] = useState(false);

  if (state === "idle" || state === "loading") {
    // Keyed by attempt: a retry restarts the slow-loading timer.
    return <ReplayLoading key={loadGen} onRetry={retryLoad} onSelectTab={onSelectTab} />;
  }

  if (state === "error") {
    const msg = errorMessage(error);
    return (
      <Message
        title={msg.title}
        reason="error"
        role="alert"
        actions={
          <>
            <button type="button" onClick={retryLoad} className={buttonClass}>
              נסו שוב
            </button>
            <OtherTabs onSelectTab={onSelectTab} />
          </>
        }
      >
        {msg.detail}
      </Message>
    );
  }

  if (state === "unavailable" || !replay) {
    const msg = unavailableMessage(reasons);
    return (
      <Message title={msg.title} reason={msg.reason ?? "unavailable"} actions={<OtherTabs onSelectTab={onSelectTab} />}>
        {msg.detail}
        {msg.reason !== "game_not_final" && <> אפשר לקרוא את הסיכום הכתוב ואת נתוני המשחק המלאים.</>}
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

/**
 * Loading skeleton (panel-shaped). After LOADING_SLOW_MS it stops pulsing and
 * offers retry + recap/stats, so it never spins forever.
 */
export function ReplayLoading({ onRetry, onSelectTab }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), LOADING_SLOW_MS);
    return () => clearTimeout(timer);
  }, []);
  if (slow) {
    return (
      <Message
        title="הטעינה נמשכת יותר מהרגיל"
        reason="slow"
        actions={
          <>
            {onRetry && (
              <button type="button" onClick={onRetry} className={buttonClass}>
                נסו שוב
              </button>
            )}
            <OtherTabs onSelectTab={onSelectTab} />
          </>
        }
      >
        נתוני השחזור עדיין לא התקבלו.
      </Message>
    );
  }
  return (
    <div className={`${styles.replayRoot} ${styles.skeletonPulse} py-4`} role="status" data-replay-state="loading">
      <span className="sr-only">טוען שחזור…</span>
      <div className="rounded-[22px] border p-4" aria-hidden="true">
        <div className="flex items-center justify-between gap-3">
          <div className={`${styles.skeleton} h-12 w-28`} />
          <div className={`${styles.skeleton} h-8 w-16`} />
          <div className={`${styles.skeleton} h-12 w-28`} />
        </div>
        <div className={`${styles.skeleton} mt-4 h-3`} />
        <div className={`${styles.skeleton} mt-4 h-20`} />
        <div className={`${styles.skeleton} mt-4 h-10`} />
      </div>
      <p className="mt-3 text-center text-[13px] text-subtle" aria-hidden="true">
        טוען שחזור…
      </p>
    </div>
  );
}
