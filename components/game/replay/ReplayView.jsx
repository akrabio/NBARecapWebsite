"use client";

// Replay tab content (task R29 — initial, functional placeholders only).
//
// Demand-loaded by GameView (next/dynamic) the first time the replay tab is
// selected, then kept mounted (hidden + inert) while another tab is shown, so
// position/speed survive tab returns. GameView keys it by game id, so a game
// change discards all replay state. `active` = replay tab selected; inactive
// pauses playback (useReplayPlayback). Data is fetched once per game via
// useReplayData — never per frame.
//
// The finished scoreboard/controls/tables replace ReadyReplay in W15–W17.

import { useMemo } from "react";
import { useTeamPicker } from "@/components/games/TeamPicker";
import { useReplayData } from "@/utils/replay-api";
import { replayStateAt } from "@/lib/replay/client-state";
import { frameAt } from "@/lib/replay/timeline";
import { useReplayPlayback } from "./useReplayPlayback";

const UNAVAILABLE_TEXT = {
  no_espn_id: "לא נמצאו נתוני מהלכים למשחק הזה.",
  unknown_event: "לא נמצאו נתוני מהלכים למשחק הזה.",
  invalid_id: "מזהה המשחק אינו תקין.",
  game_not_final: "השחזור יהיה זמין לאחר סיום המשחק.",
};
const DEFAULT_UNAVAILABLE = "אין מספיק נתונים אמינים לשחזור המשחק.";

const formatDuration = (sec) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;

function Message({ children, actions }) {
  return (
    <div className="py-10 text-center" role="status">
      <p className="text-[15px] text-body">{children}</p>
      {actions && <div className="mt-4 flex justify-center gap-2">{actions}</div>}
    </div>
  );
}

const buttonClass = "h-10 rounded-full border px-4 text-sm font-bold";

function ReadyReplay({ result, active, limited, defaultTeam }) {
  const { replay, espnGameId } = result;
  const { timeline } = replay;
  const { snapshot, containerRef, toggle, restart } = useReplayPlayback({
    gameKey: espnGameId,
    durationSec: timeline.durationSec,
    active,
  });
  const frame = frameAt(timeline, snapshot.positionSec);
  const score = useMemo(() => replayStateAt(replay, frame.eventIndex).score, [replay, frame.eventIndex]);
  const { home, away } = replay.teams;

  return (
    <div ref={containerRef} data-default-team={defaultTeam || undefined} className="py-4">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center">
        <b className="truncate">{away.nameHe || away.abbreviation}</b>
        <span className="text-[28px] font-black tabular-nums" aria-live="off">
          {score?.away ?? 0} – {score?.home ?? 0}
        </span>
        <b className="truncate">{home.nameHe || home.abbreviation}</b>
      </div>
      <p className="mt-1 text-center text-xs text-subtle">
        {frame.periodLabel || "לפני פתיחה"} · {formatDuration(snapshot.positionSec)} / {formatDuration(timeline.durationSec)}
        {limited && " · נתונים חלקיים"}
      </p>
      <div className="mt-4 flex justify-center gap-2">
        <button type="button" onClick={toggle} className={buttonClass}>
          {snapshot.playing ? "השהיה" : snapshot.ended ? "מהתחלה" : "הפעלה"}
        </button>
        <button type="button" onClick={restart} className={buttonClass}>
          אתחול
        </button>
      </div>
    </div>
  );
}

export default function ReplayView({ game, active = false, onSelectTab }) {
  const { state, data, reasons, retry } = useReplayData(game.espn_game_id, { enabled: true });
  // Favorite team from the existing picker context (no new preference store);
  // the team tabs (W17) use it as their initial selection.
  const { favorite } = useTeamPicker();
  const defaultTeam = favorite === game.away_team || favorite === game.home_team ? favorite : game.home_team;

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

  if (state === "unavailable") {
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

  return <ReadyReplay result={data} active={active} limited={state === "limited"} defaultTeam={defaultTeam} />;
}

export function ReplayLoading() {
  return <Message>טוען שחזור…</Message>;
}
