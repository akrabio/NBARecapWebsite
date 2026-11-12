// Playback controls (task R34). Every control acts on the one playback clock
// (`actions` from useReplayPlayback): play/pause, restart, speed, scrubber and
// previous/next key moment all seek or play that clock, and every subview
// follows through the shared frame — nothing here advances on its own.
//
// Replay time ("זמן שחזור", condensed playback) is labelled separately from
// the game clock shown in the scoreboard; the scrubber's value text names both.

import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from "lucide-react";
import { formatReplayTime, gameClockStatus, scrubberValueText, trackFraction } from "@/lib/replay/display";
import styles from "./replay.module.css";

export const SPEED_OPTIONS = Object.freeze([
  { value: 0.5, label: "איטי 0.5×" },
  { value: 1, label: "רגיל 1×" },
  { value: 1.5, label: "מהיר 1.5×" },
  { value: 2, label: "מהיר מאוד 2×" },
]);

const pct = (x) => `${(x * 100).toFixed(3)}%`;

export default function ReplayControls({ frame, playback, actions, timeline, teamColorById, regulationPeriods }) {
  const { prev, next } = frame.nav;
  const duration = frame.durationSec;
  const moments = timeline.moments ?? [];
  const reachedMoments = moments.filter((m) => m.startSec <= frame.sec).length;
  const ended = playback.ended || frame.frame.ended;
  const playLabel = playback.playing ? "השהיה" : ended ? "הפעלה מחדש מההתחלה" : "הפעלה";
  const valueText = scrubberValueText(frame, regulationPeriods);
  const game = gameClockStatus(frame, regulationPeriods);

  return (
    <div className="px-3 pt-1.5 pb-2.5 max-[520px]:px-2 max-[520px]:pb-2">
      <div className="flex items-center justify-between gap-2 px-1">
        <button
          type="button"
          onClick={() => prev && actions.seek(prev.sec)}
          disabled={!prev}
          aria-label="רגע המפתח הקודם"
          className="flex min-h-9 items-center gap-0.5 rounded-lg px-1.5 text-[11.5px] font-bold text-body hover:bg-white/5 disabled:cursor-default disabled:text-faint disabled:opacity-60"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
          הרגע הקודם
        </button>
        <span className="text-[10.5px] text-faint tabular-nums">
          {ended ? "השחזור הסתיים" : `${reachedMoments} / ${moments.length} רגעי מפתח`}
        </span>
        <button
          type="button"
          onClick={() => next && actions.seek(next.sec)}
          disabled={!next}
          aria-label="רגע המפתח הבא"
          className="flex min-h-9 items-center gap-0.5 rounded-lg px-1.5 text-[11.5px] font-bold text-body hover:bg-white/5 disabled:cursor-default disabled:text-faint disabled:opacity-60"
        >
          הרגע הבא
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="flex items-center gap-2 max-[520px]:gap-1.5">
        <button
          type="button"
          onClick={ended ? () => { actions.restart(); actions.play(); } : actions.toggle}
          aria-label={playLabel}
          title={playLabel}
          className="grid h-11 w-11 flex-none place-items-center rounded-full bg-brand text-on-brand shadow-[0_4px_14px_color-mix(in_srgb,var(--brand)_35%,transparent)] active:scale-95 max-[520px]:h-10 max-[520px]:w-10"
        >
          {playback.playing ? <Pause className="h-5 w-5" fill="currentColor" aria-hidden="true" /> : <Play className="h-5 w-5" fill="currentColor" aria-hidden="true" />}
        </button>

        <div className={styles.track}>
          <div className={styles.fill} style={{ width: pct(trackFraction(frame.sec, duration)) }} />
          <div aria-hidden="true">
            {(timeline.periods ?? []).slice(1).map((p) => (
              <i key={p.period} className={styles.tick} style={{ insetInlineStart: pct(trackFraction(p.startSec, duration)) }} />
            ))}
          </div>
          <div aria-hidden="true">
            {moments.map((m) => {
              const on = m.startSec <= frame.sec;
              // Team color only once reached: an unreached dot does not reveal who scores.
              const hl = on ? teamColorById?.(m.highlightId) : null;
              return (
                <b
                  key={m.highlightId}
                  className={`${styles.mark} ${on ? styles.markOn : ""}`}
                  style={{ insetInlineStart: pct(trackFraction(m.startSec, duration)), ...(hl ? { "--mark-c": hl } : null) }}
                />
              );
            })}
          </div>
          <input
            type="range"
            className={styles.range}
            min={0}
            max={duration}
            step={0.1}
            value={Math.min(frame.sec, duration)}
            onChange={(e) => {
              // The range snaps to its 0.1 s step, so its max can sit just
              // below the real duration; the far end means "the end".
              const v = Number(e.target.value);
              actions.seek(v >= duration - 0.1 ? duration : v);
            }}
            aria-label="מיקום בשחזור"
            aria-valuetext={valueText}
          />
        </div>

        <select
          value={String(playback.speed)}
          onChange={(e) => actions.setSpeed(Number(e.target.value))}
          aria-label="מהירות ניגון"
          className="h-9 flex-none rounded-lg bg-surface-2 px-1.5 text-[12px] font-semibold text-ink max-[520px]:text-[11px]"
        >
          {SPEED_OPTIONS.map((o) => (
            <option key={o.value} value={String(o.value)}>
              {o.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={actions.restart}
          aria-label="חזרה להתחלה"
          title="חזרה להתחלה"
          className="grid h-11 w-9 flex-none place-items-center rounded-lg text-subtle hover:bg-white/5"
        >
          <RotateCcw className="h-[18px] w-[18px]" aria-hidden="true" />
        </button>
      </div>

      <p className="mt-0.5 flex justify-between gap-2 px-1 text-[10.5px] text-subtle tabular-nums">
        <span>
          זמן שחזור · <bdi dir="ltr">{formatReplayTime(frame.sec)}</bdi> מתוך <bdi dir="ltr">{formatReplayTime(duration)}</bdi>
        </span>
        <span>
          שעון המשחק · {game.clock ? <>{game.label} <bdi dir="ltr">{game.clock}</bdi></> : game.label}
        </span>
      </p>
    </div>
  );
}
