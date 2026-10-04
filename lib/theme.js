// Light/dark choice, kept per device. "auto" follows the device setting.
export const THEMES = ["auto", "light", "dark"];

// Must match --app-bg in globals.css and viewport.themeColor in app/layout.js.
const THEME_COLORS = { light: "#f5f6f8", dark: "#0b0d12" };

export function readTheme() {
  try {
    const saved = localStorage.getItem("theme");
    return THEMES.includes(saved) ? saved : "auto";
  } catch {
    return "auto";
  }
}

// For useSyncExternalStore: changes from this tab (saveTheme) and others.
const listeners = new Set();
export function subscribeTheme(listener) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function saveTheme(theme) {
  try {
    if (theme === "auto") localStorage.removeItem("theme");
    else localStorage.setItem("theme", theme);
  } catch {}
  listeners.forEach((listener) => listener());
}

// Sets the page theme and the browser chrome color. The <meta name="theme-color">
// tags are per color scheme, so a forced theme overrides both.
export function applyTheme(theme) {
  if (theme === "auto") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;

  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    meta.dataset.original ??= meta.content;
    meta.content = theme === "auto" ? meta.dataset.original : THEME_COLORS[theme];
  });
}
