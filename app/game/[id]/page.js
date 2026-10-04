import { notFound, redirect } from "next/navigation";
import GameView from "@/components/game/GameView";
import BrowseColumn from "@/components/games/BrowseColumn";
import { TeamPickerProvider } from "@/components/games/TeamPicker";
import { NavigationProvider } from "@/components/NavigationProvider";
import { getBrowseData, toSiblings } from "@/lib/browse";
import { readFavorite } from "@/lib/favorite-server";
import { getGameById, getGameMedia, warmGames } from "@/lib/games";
import { getSnippet } from "@/lib/recap";
import { todayKey } from "@/lib/dates";
import { nbaEnToHe, nbaShortHe } from "@/utils/consts";
import { matchupText } from "@/utils/gameUtils";

const shortName = (team) => nbaShortHe[team] || nbaEnToHe[team] || team;

export async function generateMetadata({ params }) {
  const { id } = await params;
  const game = await getGameById(id);
  if (!game) return { title: "המשחק לא נמצא · סיכומי NBA" };

  const title = `${matchupText(game, shortName)} · סיכומי NBA`;
  const description = (getSnippet(game.content) || "").slice(0, 200);
  return {
    title,
    description,
    alternates: { canonical: `/game/${game.id}` },
    openGraph: { title, description, type: "article", locale: "he_IL" },
    twitter: { card: "summary_large_image", title, description },
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
  const today = todayKey();
  const [{ favorite, showPrompt, data }, media] = await Promise.all([
    readFavorite().then(async ({ favorite, showPrompt }) => ({
      favorite,
      showPrompt,
      data: await getBrowseData({ date: game.date, favorite, today }),
    })),
    getGameMedia(game),
  ]);

  // The same day's other games are the likely next reads (previous/next).
  warmGames(data.ordered.filter((other) => other.id !== game.id));

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
          <GameView key={game.id} game={game} media={media} siblings={toSiblings(data.ordered)} />
        </div>
      </TeamPickerProvider>
    </NavigationProvider>
  );
}
