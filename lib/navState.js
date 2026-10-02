// Client-side navigation memory. Lives for the tab's session (reset on a full
// reload), which is exactly when "back" should return to the games list rather
// than leave the site.
export const navState = {
  cameFromList: false,
};
