import { notFound, redirect } from "next/navigation";
import GameView from "@/components/game/GameView";
import BrowseColumn from "@/components/games/BrowseColumn";
import { TeamPickerProvider } from "@/components/games/TeamPicker";
import { NavigationProvider } from "@/components/NavigationProvider";
import { getBrowseData, toSiblings } from "@/lib/browse";
import { readFavorite } from "@/lib/favorite-server";
import { getGameById } from "@/lib/games";
import { getSnippet } from "@/lib/recap";
import { todayKey } from "@/lib/dates";
import { nbaEnToHe, nbaShortHe } from "@/utils/consts";

const shortName = (team) => nbaShortHe[team] || nbaEnToHe[team] || team;

export async function generateMetadata({ params }) {
  const { id } = await params;
  const game = await getGameById(id);
  if (!game) return { title: "המשחק לא נמצא · סיכומי NBA" };

  const title = `${shortName(game.away_team)} ${game.away_score}–${game.home_score} ${shortName(game.home_team)} · סיכומי NBA`;
  const description = (getSnippet(game.content) || "").slice(0, 200);
  return {
    title,
    description,
    alternates: { canonical: `/game/${game.id}` },
    openGraph: { title, description, type: "article", locale: "he_IL" },
    twitter: { card: "summary", title, description },
  };
}

export default async function GamePage({ params }) {
  const { id } = await params;
  const game = await getGameById(id);
  if (!game) notFound();

  // Legacy ESPN-id links resolve to the canonical Mongo id URL.
  if (game.id !== id) redirect(`/game/${game.id}`);

  // The day's list: beside the recap on desktop, and the order for
  // "previous / next game" on phones.
  const { favorite, showPrompt } = await readFavorite();
  const today = todayKey();
  const data = await getBrowseData({ date: game.date, favorite, today });

  return (
    <NavigationProvider>
      <TeamPickerProvider favorite={favorite}>
        <div className="lg:grid lg:grid-cols-[400px_1fr]">
          <BrowseColumn
            data={data}
            today={today}
            favorite={favorite}
            showPrompt={showPrompt}
            selectedId={game.id}
            className="hidden lg:block"
          />
          <GameView key={game.id} game={game} siblings={toSiblings(data.ordered)} />
        </div>
      </TeamPickerProvider>
    </NavigationProvider>
  );
}
