import WinProbStrip from "@/components/ui/WinProbStrip";
import { getLowPoint } from "@/utils/gameStory";

// "How the game went": the win-probability chart, the winner's worst moment
// and how often the lead changed hands. Nothing without a story.
export default function GameFlow({ game }) {
  const story = game.story;
  if (!story?.wp && !story?.margin) return null;
  const low = getLowPoint(game);
  const changes = story.lead_changes;

  return (
    <section className="mt-7 rounded-[14px] border bg-surface px-3.5 pt-3 pb-3.5">
      <h3 className="mb-2.5 flex items-baseline justify-between text-[15px] font-extrabold">
        איך המשחק התגלגל
        <small className="text-xs font-medium text-subtle">{story.wp ? "סיכויי ניצחון" : "הפרש נקודות"}</small>
      </h3>
      <WinProbStrip game={game} size="lg" />
      {(low || changes != null) && (
        <p className="mt-2.5 text-[13px] leading-relaxed text-subtle">
          {low && (
            <>
              נקודת השפל של ה{low.team}: <b className="text-ink">{low.pct}% סיכוי לנצח</b> {low.when}.{" "}
            </>
          )}
          {changes != null && (changes ? `${changes} חילופי הובלה.` : "בלי חילופי הובלה.")}
        </p>
      )}
    </section>
  );
}
