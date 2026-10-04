"use client";

import { useSyncExternalStore } from "react";
import { Contrast, Moon, Sun } from "lucide-react";
import { toast } from "@/components/ui/Toast";
import { THEMES, applyTheme, readTheme, saveTheme, subscribeTheme } from "@/lib/theme";

// Cycles: follow the device → light → dark. The choice is kept per device and
// applied before paint by the script in app/layout.js.
const LABELS = { auto: "לפי המכשיר", light: "בהיר", dark: "כהה" };
const ICONS = { auto: Contrast, light: Sun, dark: Moon };

export default function ThemeToggle() {
  // The saved choice lives in localStorage; the server renders "auto".
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => "auto");

  const cycle = () => {
    const next = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
    applyTheme(next);
    saveTheme(next);
    toast(`ערכת צבעים: ${LABELS[next]}`);
  };

  const Icon = ICONS[theme];
  return (
    <button
      onClick={cycle}
      aria-label={`ערכת צבעים: ${LABELS[theme]}`}
      title={LABELS[theme]}
      className="grid h-11 w-11 place-items-center rounded-xl text-subtle active:bg-surface-2 lg:hover:bg-surface-2"
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}
