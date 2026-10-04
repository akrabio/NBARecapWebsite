import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { userAgent } from "next/server";
import BrowseColumn from "@/components/games/BrowseColumn";
import { TeamPickerProvider } from "@/components/games/TeamPicker";
import GameView from "@/components/game/GameView";
import { NavigationProvider } from "@/components/NavigationProvider";
import { getBrowseData, toSiblings } from "@/lib/browse";
import { readFavorite } from "@/lib/favorite-server";
import { getGameById, getGameMedia, warmGames } from "@/lib/games";
import { todayKey } from "@/lib/dates";
import { nbaEnToHe } from "@/utils/consts";

export default async function Home({ searchParams }) {
  const params = await searchParams;

  // Old shared links were /?game=<id>; games now have their own page.
  if (params.game) redirect(`/game/${encodeURIComponent(params.game)}`);

  const today = todayKey();
  const team = nbaEnToHe[params.team] ? params.team : null;
  const { favorite, showPrompt } = await readFavorite();
  const data = await getBrowseData({ date: params.date, team, favorite, today });

  // Desktop shows the top game beside the list, so the right pane is never
  // empty. It's rendered on the server (no pop-in after load) and skipped
  // for phones, which never show it.
  const isPhone = userAgent({ headers: await headers() }).device.type === "mobile";
  const preview = !isPhone && data.ordered[0] ? await getGameById(data.ordered[0].id) : null;
  const previewMedia = preview ? await getGameMedia(preview) : null;

  // Readers pick a game from this list next; get each one ready meanwhile.
  warmGames(data.ordered.filter((game) => game.id !== preview?.id));

  return (
    <NavigationProvider>
      <TeamPickerProvider favorite={favorite}>
        <div className="lg:grid lg:grid-cols-[400px_1fr]">
          <BrowseColumn
            data={data}
            today={today}
            favorite={favorite}
            showPrompt={showPrompt}
            selectedId={preview?.id}
          />
          {preview && (
            <div className="hidden lg:block">
              <GameView key={preview.id} game={preview} media={previewMedia} siblings={toSiblings(data.ordered)} />
            </div>
          )}
        </div>
      </TeamPickerProvider>
    </NavigationProvider>
  );
}
