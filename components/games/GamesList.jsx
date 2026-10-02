import { GameCard, GameRow } from "./GameCard";
import EmptyDay from "./EmptyDay";
import { FavoritePrompt, FavoriteTitle } from "./FavoriteTeam";
import { formatLongDate } from "@/lib/dates";
import { nbaShortHe } from "@/utils/consts";

function SectionTitle({ title, aside }) {
  return (
    <div className="mt-[18px] mb-2 flex items-baseline justify-between first:mt-0.5">
      <h2 className="text-sm font-extrabold text-subtle">{title}</h2>
      {aside && <span className="text-[12.5px] text-faint">{aside}</span>}
    </div>
  );
}

// The games list for a date or a team. `selectedId` marks the game open
// beside the list on desktop.
export default function GamesList({ data, favorite, showPrompt, selectedId }) {
  const card = (game, props = {}) => <GameCard key={game.id} game={game} selected={game.id === selectedId} {...props} />;
  const row = (game, props = {}) => <GameRow key={game.id} game={game} selected={game.id === selectedId} {...props} />;

  if (data.mode === "team") {
    if (data.games.length === 0) return <EmptyDay message="לא נמצאו סיכומים לקבוצה הזו" />;
    return (
      <>
        {card(data.games[0], { showDate: true })}
        <div className="grid gap-2">{data.games.slice(1).map((game) => row(game, { showDate: true }))}</div>
      </>
    );
  }

  if (data.ordered.length === 0) return <EmptyDay date={data.date} previousDate={data.previousDate} />;

  const { favoriteGame, lastFavoriteGame, featured, rest } = data;
  return (
    <>
      {favorite && (
        <section>
          <FavoriteTitle />
          {favoriteGame ? (
            card(favoriteGame)
          ) : (
            <div className="mb-2.5">
              <p className="mb-2 text-sm text-subtle">
                ה{nbaShortHe[favorite]} לא שיחקו ביום הזה{lastFavoriteGame ? ". המשחק האחרון שלהם:" : "."}
              </p>
              {lastFavoriteGame && row(lastFavoriteGame, { showDate: true })}
            </div>
          )}
        </section>
      )}
      {showPrompt && <FavoritePrompt />}
      {featured.length > 0 && <SectionTitle title="שווה לקרוא" aside={formatLongDate(data.date)} />}
      {featured.map((game) => card(game))}
      {rest.length > 0 && (
        <>
          <SectionTitle title="כל התוצאות" aside={`${rest.length} משחקים`} />
          <div className="grid gap-2">{rest.map((game) => row(game))}</div>
        </>
      )}
    </>
  );
}
