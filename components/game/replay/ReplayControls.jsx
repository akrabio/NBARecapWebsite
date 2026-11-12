// Playback controls (R31 stub; finished in W16 / R34). Every control seeks
// the one playback clock; all subviews follow through the shared frame.

const formatDuration = (sec) => {
  const whole = Math.floor(sec);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
};

const buttonClass = "h-10 rounded-full border px-4 text-sm font-bold disabled:opacity-40";

export default function ReplayControls({ frame, playback, actions }) {
  const { prev, next } = frame.nav;
  return (
    <div className="mt-4">
      <p className="text-center text-xs text-subtle">
        זמן שחזור <bdi dir="ltr">{formatDuration(frame.sec)} / {formatDuration(frame.durationSec)}</bdi>
      </p>
      <div className="mt-2 flex justify-center gap-2">
        <button type="button" className={buttonClass} disabled={!prev} onClick={() => prev && actions.seek(prev.sec)}>
          לרגע הקודם
        </button>
        <button type="button" className={buttonClass} onClick={actions.toggle}>
          {playback.playing ? "השהיה" : playback.ended ? "מהתחלה" : "הפעלה"}
        </button>
        <button type="button" className={buttonClass} disabled={!next} onClick={() => next && actions.seek(next.sec)}>
          לרגע הבא
        </button>
      </div>
    </div>
  );
}
