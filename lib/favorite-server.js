import { cookies } from "next/headers";
import { FAVORITE_COOKIE, FAVORITE_PROMPT_COOKIE } from "@/lib/favorite";
import { nbaEnToHe } from "@/utils/consts";

// Reads "my team" and whether to show the pick-a-team prompt.
export async function readFavorite() {
  const store = await cookies();
  const value = decodeURIComponent(store.get(FAVORITE_COOKIE)?.value || "");
  const favorite = nbaEnToHe[value] ? value : null;
  const showPrompt = !favorite && store.get(FAVORITE_PROMPT_COOKIE)?.value !== "off";
  return { favorite, showPrompt };
}
