// "My team" is kept in cookies (per device, no account) so the server can put
// that team's game first when rendering the list — no client-side reshuffle.
export const FAVORITE_COOKIE = "fav_team";
export const FAVORITE_PROMPT_COOKIE = "fav_prompt";

const ONE_YEAR = 60 * 60 * 24 * 365;

function writeCookie(name, value) {
  document.cookie =
    value == null
      ? `${name}=; path=/; max-age=0; samesite=lax`
      : `${name}=${encodeURIComponent(value)}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
}

export function saveFavoriteTeam(team) {
  writeCookie(FAVORITE_COOKIE, team);
}

export function dismissFavoritePrompt() {
  writeCookie(FAVORITE_PROMPT_COOKIE, "off");
}
