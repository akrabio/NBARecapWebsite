import { getAllGameIds } from "@/lib/games";
import { SITE_URL } from "@/lib/site";

// Rendered per request (it reads the database), so builds don't need credentials.
export const dynamic = "force-dynamic";

export default async function sitemap() {
  const games = await getAllGameIds();
  return [
    { url: SITE_URL, changeFrequency: "daily", priority: 1 },
    ...games.map((game) => ({
      url: `${SITE_URL}/game/${game.id}`,
      lastModified: game.date,
      changeFrequency: "yearly",
      priority: 0.7,
    })),
  ];
}
