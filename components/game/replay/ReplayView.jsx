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
// recompute the cheap time fields. The finished subviews replace the stubs in
// W16–W17.
//
// Owned here (game-local, reset by the game-id key): selected stats team
// (default chosen once: involved favorite, else home) and bench expansion.

import { useMemo, useState } from "react";
import { useTeamPicker } from "@/components/games/TeamPicker";
import { useReplayData } from "@/utils/replay-api";
import { createFrameDeriver, defaultTeamId } from "@/lib/replay/frame";
import { useReplayPlayback } from "./useReplayPlayback";
import ReplayScoreboard from "./ReplayScoreboard";
import ReplayProbability from "./ReplayProbability";
import ReplaySpotlight from "./ReplaySpotlight";
import ReplayControls from "./ReplayControls";
import ReplayTeamTables from "./ReplayTeamTables";

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

function ReadyReplay({ result, active, limited, onSelectTab, selectedTeamId, onSelectTeam, benchExpanded, onToggleBench }) {
  const { replay, espnGameId } = result;
  const { snapshot, containerRef, play, pause, toggle, seek, setSpeed, restart } = useReplayPlayback({
    gameKey: espnGameId,
    durationSec: replay.timeline.durationSec,
    active,
  });
  const actions = useMemo(() => ({ play, pause, toggle, seek, setSpeed, restart }), [play, pause, toggle, seek, setSpeed, restart]);
  const frame = useReplayFrame(replay, snapshot.positionSec);
  const ended = snapshot.ended || frame.frame.ended;

  return (
    <div ref={containerRef} className="py-4" data-event-index={frame.frame.eventIndex}>
      <ReplayScoreboard frame={frame} teams={replay.teams} />
      <ReplayProbability frame={frame} teams={replay.teams} />
      {limited && <p className="mt-1 text-center text-xs text-subtle">נתונים חלקיים</p>}
      <ReplaySpotlight frame={frame} />
      <ReplayControls frame={frame} playback={snapshot} actions={actions} />
      {ended && (
        <ReplayEnd
          onReplay={() => {
            restart();
            play();
          }}
          onSelectTab={onSelectTab}
        />
      )}
      <ReplayTeamTables
        frame={frame}
        replay={replay}
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
