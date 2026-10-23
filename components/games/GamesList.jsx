import { GameCard, GameRow } from "./GameCard";
import EmptyDay from "./EmptyDay";
import { FavoritePrompt, FavoriteTitle } from "./FavoriteTeam";
import FavoriteCard from "./FavoriteCard";
import NightBrief from "./NightBrief";
import StandingsSheet from "./StandingsSheet";
import { formatLongDate } from "@/lib/dates";

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

  const { favoriteGame, favoriteRecent, favoriteStanding, standings, nextGame, summary, others } = data;
  return (
    <>
      {favorite && (
        <section>
          <FavoriteTitle />
          <FavoriteCard
            team={favorite}
            game={favoriteGame}
            recent={favoriteRecent}
            standing={favoriteStanding}
            nextGame={nextGame}
            date={data.date}
            selectedId={selectedId}
          />
        </section>
      )}
      {summary.show && <NightBrief summary={summary} />}
      {standings && <StandingsSheet standings={standings} favorite={favorite} />}
      {showPrompt && <FavoritePrompt />}
      {others.length > 0 && <SectionTitle title={favorite ? "שאר המשחקים" : "כל המשחקים"} aside={formatLongDate(data.date)} />}
      {others.map((game) => card(game))}
    </>
  );
}
