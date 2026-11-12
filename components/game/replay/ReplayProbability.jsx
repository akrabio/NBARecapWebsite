// Win-probability bar + compact history (task R33). Uses only the frame's
// reached samples (eventIndex ≤ current) and the state's current value:
// - no invented initial 50% — "אין עדיין נתון" until the first sample;
// - the history grows with playback and shrinks on backward seek (it is
//   recomputed from `frame.probability.samples`);
// - carry-forward step line, no interpolation between ESPN samples;
// - x = replay time right-to-left like the scrubber, so period ticks sit at
//   the same positions as the progress track's quarter ticks;
// - above the dashed midline = the home team (labelled in the chart).
// Missing probability → an explicit label, never a blank chart.

import { useMemo } from "react";
import { eventRevealSecs, probabilityPath, probabilityPercents, hePeriodLabel } from "@/lib/replay/display";
import styles from "./replay.module.css";

const W = 1000;
const H = 48;

export default function ReplayProbability({ frame, teams, timeline, available, regulationPeriods }) {
  const revealSecs = useMemo(() => eventRevealSecs(timeline), [timeline]);
  const { samples, current } = frame.probability;
  // Path through reached samples only. `samples` is reused between ticks of
  // the same event index (frame deriver memo), so this recomputes per event;
  // the carry-forward tail to "now" is appended per tick.
  const base = useMemo(
    () => probabilityPath(samples, revealSecs, timeline.durationSec, null, { width: W, height: H }),
    [samples, revealSecs, timeline.durationSec],
  );

  if (!available) {
    return (
      <div className="px-5 pb-2 max-[520px]:px-3">
        <p className="rounded-lg bg-surface-2 px-3 py-2 text-center text-[12px] text-subtle">הסתברות ניצחון אינה זמינה למשחק זה</p>
      </div>
    );
  }

  const pct = probabilityPercents(current);
  const homeName = teams.home.nameHe || teams.home.abbreviation;
  const awayName = teams.away.nameHe || teams.away.abbreviation;
  const xNow = W - (Math.min(frame.sec, timeline.durationSec) / (timeline.durationSec || 1)) * W;
  const path = base ? { d: `${base.d}H${Math.round(xNow * 10) / 10}`, y: base.end.y } : null;
  const periods = timeline.periods ?? [];

  return (
    <div className="px-5 pb-2 max-[520px]:px-3">
      <div className="mb-1 flex items-center justify-between text-[11px] text-subtle max-[520px]:text-[10px]">
        <strong className="text-[12px] text-ink tabular-nums max-[520px]:text-[11px]">
          {awayName} {pct ? <bdi dir="ltr">{pct.away}%</bdi> : null}
        </strong>
        <span>{pct ? "סיכויי ניצחון" : "סיכויי ניצחון · אין עדיין נתון"}</span>
        <strong className="text-[12px] text-ink tabular-nums max-[520px]:text-[11px]">
          {homeName} {pct ? <bdi dir="ltr">{pct.home}%</bdi> : null}
        </strong>
      </div>
      <div
        className="flex h-[5px] overflow-hidden rounded-full bg-surface-2"
        role="img"
        aria-label={pct ? `סיכויי ניצחון: ${awayName} ${pct.away}%, ${homeName} ${pct.home}%` : "סיכויי ניצחון: אין עדיין נתון"}
      >
        {pct && (
          <>
            <i className={styles.probSeg} style={{ width: `${pct.away}%`, background: teams.away.uiColor }} />
            <i className={`${styles.probSeg} flex-1`} style={{ background: teams.home.uiColor }} />
          </>
        )}
      </div>
      {/* Chart + legend gutter. The gutter sits on the physical left (the
          game's end side in RTL) so the labels never cover the curve. */}
      <div className="mt-1.5 flex gap-1.5" dir="ltr">
        <div className="flex w-[52px] flex-none flex-col justify-between py-px text-[9.5px] leading-none font-bold text-subtle max-[520px]:w-[44px] max-[520px]:text-[9px]" dir="rtl" aria-hidden="true">
          <span className="truncate">▲ {homeName}</span>
          <span className="truncate">▼ {awayName}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="relative h-[44px] max-[520px]:h-[32px]">
            <svg
              viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="none"
              className="absolute inset-0 block h-full w-full"
              role="img"
              aria-label={`היסטוריית סיכויי הניצחון עד הרגע הנוכחי. קו גבוה מהאמצע: יתרון ל${homeName}; נמוך מהאמצע: יתרון ל${awayName}.`}
            >
              <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="#ffffff26" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
              {periods.slice(1).map((p) => {
                const x = W - (p.startSec / (timeline.durationSec || 1)) * W;
                return <line key={p.period} x1={x} x2={x} y1="0" y2={H} stroke="#ffffff1c" vectorEffect="non-scaling-stroke" />;
              })}
              {path && <path d={path.d} fill="none" stroke="#c3cddd" strokeWidth="1.8" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
            </svg>
            {path && (
              <span
                className="pointer-events-none absolute -mt-[3px] -ml-[3px] h-1.5 w-1.5 rounded-full bg-brand"
                style={{ left: `${(xNow / W) * 100}%`, top: `${(path.y / H) * 100}%` }}
                aria-hidden="true"
              />
            )}
          </div>
          <div className="flex pt-0.5 text-[10px] text-faint max-[520px]:text-[9px]" dir="rtl" aria-hidden="true">
            {periods.map((p) => (
              <span key={p.period} className="truncate text-center" style={{ flex: `${Math.max(0.001, p.endSec - p.startSec)} 1 0` }}>
                {hePeriodLabel(p.period, regulationPeriods)}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
