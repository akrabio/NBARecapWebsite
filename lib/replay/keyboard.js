// Keyboard routing (task R38). Browser-safe, zero imports; the predicates take
// plain descriptors so they are node-testable. One key → one effect:
//
// Replay shortcuts (only while focus is inside the replay view — its root is
// focusable, so clicking the panel gives it focus):
//   Space / K  → play/pause   (not on buttons/tabs/links: Space natively clicks
//                              them; not in form controls)
//   ← (ArrowLeft)  → next key moment       (RTL: left = forward, like the tabs)
//   → (ArrowRight) → previous key moment
// Arrows are left native on form controls (range seeks, select changes),
// on team tabs (they move between tabs) and on the horizontally scrollable
// stat tables (they scroll).
//
// GameView's desktop ↑/↓ sibling-game navigation ignores keys from form
// controls, from anything inside the replay tab panel, keys already handled
// (defaultPrevented), modified keys and keys while a dialog is open.

/**
 * Coarse kind of a key event target:
 * 'editable' (input/textarea/select/contenteditable) | 'activatable' (button, link, summary, role=button/tab/…)
 * | 'tab' (role=tab) | 'scroll' (horizontally scrollable stat table) | 'other'.
 */
export function keyTargetKind(target) {
  if (!target || typeof target !== "object") return "other";
  const tag = String(target.tagName || "").toUpperCase();
  if (["INPUT", "TEXTAREA", "SELECT"].includes(tag) || target.isContentEditable) return "editable";
  const role = typeof target.getAttribute === "function" ? target.getAttribute("role") : null;
  if (role === "tab") return "tab";
  if (["BUTTON", "A", "SUMMARY"].includes(tag) || ["button", "link", "checkbox", "switch", "menuitem", "option"].includes(role)) return "activatable";
  if (typeof target.closest === "function" && target.closest("[data-replay-scroll]")) return "scroll";
  return "other";
}

const modified = (e) => Boolean(e.altKey || e.ctrlKey || e.metaKey);

/**
 * Replay shortcut for a keydown inside the replay view: 'toggle' | 'next' | 'prev' | null.
 * `e` = { key, code, altKey, ctrlKey, metaKey, defaultPrevented, targetKind }.
 */
export function replayShortcut(e) {
  if (!e || e.defaultPrevented || modified(e)) return null;
  const kind = e.targetKind ?? "other";
  if (kind === "editable") return null;
  const isSpace = e.key === " " || e.code === "Space";
  const isK = e.code === "KeyK" || e.key === "k" || e.key === "K";
  if (isSpace) return kind === "activatable" || kind === "tab" ? null : "toggle";
  if (isK) return kind === "tab" ? null : "toggle";
  if (kind === "tab" || kind === "scroll") return null;
  if (e.key === "ArrowLeft") return "next";
  if (e.key === "ArrowRight") return "prev";
  return null;
}

/**
 * Whether GameView's window ↑/↓ handler may navigate to a sibling game.
 * `e` = { key, altKey, ctrlKey, metaKey, defaultPrevented, targetKind, insideReplay, dialogOpen, desktop }.
 */
export function siblingNavAllowed(e) {
  if (!e || !["ArrowUp", "ArrowDown"].includes(e.key)) return false;
  if (e.defaultPrevented || modified(e)) return false;
  if (!e.desktop || e.dialogOpen || e.insideReplay) return false;
  return e.targetKind !== "editable";
}
