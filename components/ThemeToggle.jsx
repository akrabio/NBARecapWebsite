"use client";

import { useEffect, useState } from "react";
import { Contrast, Moon, Sun } from "lucide-react";
import { toast } from "@/components/ui/Toast";

// Cycles: follow the device → light → dark. The choice is kept per device and
// applied before paint by the script in app/layout.js.
const THEMES = ["auto", "light", "dark"];
const LABELS = { auto: "לפי המכשיר", light: "בהיר", dark: "כהה" };
const ICONS = { auto: Contrast, light: Sun, dark: Moon };

function readTheme() {
  try {
    const saved = localStorage.getItem("theme");
    return THEMES.includes(saved) ? saved : "auto";
  } catch {
    return "auto";
  }
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState("auto");

  useEffect(() => setTheme(readTheme()), []);

  const cycle = () => {
    const next = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
    setTheme(next);
    if (next === "auto") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = next;
    try {
      if (next === "auto") localStorage.removeItem("theme");
      else localStorage.setItem("theme", next);
    } catch {}
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
