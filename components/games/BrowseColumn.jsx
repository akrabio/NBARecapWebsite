import AppHeader from "./AppHeader";
import GamesList from "./GamesList";
import ListColumn from "./ListColumn";
import Footer from "@/components/Footer";
import { PendingFade } from "@/components/NavigationProvider";

// Header + games list + footer. The whole page on phones; the right-hand
// column of the split view on desktop.
export default function BrowseColumn({ data, today, favorite, showPrompt, selectedId, className }) {
  return (
    <ListColumn scrollKey={data.date || data.team} className={className}>
      <AppHeader date={data.date} today={today} counts={data.counts} team={data.team} teamGameCount={data.games?.length} />
      <main className="mx-auto max-w-3xl px-4 pt-3.5">
        <PendingFade>
          <GamesList data={data} favorite={favorite} showPrompt={showPrompt} selectedId={selectedId} />
        </PendingFade>
      </main>
      <Footer />
    </ListColumn>
  );
}
