import { describe, expect, it } from "vitest";
import { BOTH_MIN_WIDTH, STICKY_TOP, TABLE_MIN_WIDTH, TABLES_GAP, tableLayoutFor } from "@/lib/replay/layout";
import { keyTargetKind, replayShortcut, siblingNavAllowed } from "@/lib/replay/keyboard";

describe("tableLayoutFor", () => {
  it("uses tabs below the threshold and both at/above it", () => {
    expect(tableLayoutFor(BOTH_MIN_WIDTH - 1)).toBe("tabs");
    expect(tableLayoutFor(BOTH_MIN_WIDTH)).toBe("both");
    // 1280px window − 400px sidebar − 32px padding
    expect(tableLayoutFor(848)).toBe("tabs");
    // 1440px window
    expect(tableLayoutFor(1008)).toBe("both");
    expect(tableLayoutFor(358)).toBe("tabs");
  });
  it("keeps the fallback while unmeasured or hidden", () => {
    expect(tableLayoutFor(0, "both")).toBe("both");
    expect(tableLayoutFor(NaN)).toBe("tabs");
  });
  it("threshold leaves each side-by-side table at most one 44px column short", () => {
    const perTable = (BOTH_MIN_WIDTH - TABLES_GAP) / 2;
    expect(TABLE_MIN_WIDTH - perTable).toBeLessThanOrEqual(44);
    expect(STICKY_TOP).toBe(96);
  });
});

const el = (tagName, { role = null, scroll = false, editable = false } = {}) => ({
  tagName,
  isContentEditable: editable,
  getAttribute: (name) => (name === "role" ? role : null),
  closest: (sel) => (sel === "[data-replay-scroll]" && scroll ? {} : null),
});

describe("keyTargetKind", () => {
  it("classifies targets", () => {
    expect(keyTargetKind(el("INPUT"))).toBe("editable");
    expect(keyTargetKind(el("SELECT"))).toBe("editable");
    expect(keyTargetKind(el("DIV", { editable: true }))).toBe("editable");
    expect(keyTargetKind(el("BUTTON", { role: "tab" }))).toBe("tab");
    expect(keyTargetKind(el("BUTTON"))).toBe("activatable");
    expect(keyTargetKind(el("A"))).toBe("activatable");
    expect(keyTargetKind(el("TD", { scroll: true }))).toBe("scroll");
    expect(keyTargetKind(el("DIV"))).toBe("other");
    expect(keyTargetKind(null)).toBe("other");
  });
});

describe("replayShortcut", () => {
  const k = (key, targetKind = "other", extra = {}) => replayShortcut({ key, code: extra.code, targetKind, ...extra });
  it("Space toggles except where Space natively activates or edits", () => {
    expect(k(" ")).toBe("toggle");
    expect(k(" ", "scroll")).toBe("toggle");
    expect(k(" ", "activatable")).toBeNull();
    expect(k(" ", "tab")).toBeNull();
    expect(k(" ", "editable")).toBeNull();
  });
  it("K toggles (any layout via code), not in form controls or tabs", () => {
    expect(k("k")).toBe("toggle");
    expect(k("ל", "activatable", { code: "KeyK" })).toBe("toggle");
    expect(k("k", "editable")).toBeNull();
    expect(k("k", "tab")).toBeNull();
  });
  it("RTL arrows: left = next moment, right = previous; native on range/select/tabs/scroll", () => {
    expect(k("ArrowLeft")).toBe("next");
    expect(k("ArrowRight", "activatable")).toBe("prev");
    for (const kind of ["editable", "tab", "scroll"]) expect(k("ArrowLeft", kind)).toBeNull();
    expect(k("ArrowUp")).toBeNull();
  });
  it("ignores modified or already-handled keys", () => {
    expect(k(" ", "other", { ctrlKey: true })).toBeNull();
    expect(k("ArrowLeft", "other", { metaKey: true })).toBeNull();
    expect(k(" ", "other", { defaultPrevented: true })).toBeNull();
  });
});

describe("siblingNavAllowed", () => {
  const base = { key: "ArrowDown", targetKind: "other", desktop: true, insideReplay: false, dialogOpen: false };
  it("navigates on desktop from plain targets", () => {
    expect(siblingNavAllowed(base)).toBe(true);
    expect(siblingNavAllowed({ ...base, key: "ArrowUp", targetKind: "activatable" })).toBe(true);
  });
  it("never from the replay panel, form controls, dialogs, handled or modified keys, or mobile", () => {
    expect(siblingNavAllowed({ ...base, insideReplay: true })).toBe(false);
    expect(siblingNavAllowed({ ...base, targetKind: "editable" })).toBe(false);
    expect(siblingNavAllowed({ ...base, dialogOpen: true })).toBe(false);
    expect(siblingNavAllowed({ ...base, defaultPrevented: true })).toBe(false);
    expect(siblingNavAllowed({ ...base, altKey: true })).toBe(false);
    expect(siblingNavAllowed({ ...base, desktop: false })).toBe(false);
    expect(siblingNavAllowed({ ...base, key: "ArrowLeft" })).toBe(false);
  });
});
