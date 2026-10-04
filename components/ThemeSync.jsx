"use client";

import { useEffect } from "react";
import { applyTheme, readTheme } from "@/lib/theme";

// The inline script in app/layout.js sets the theme before paint; this also
// syncs the browser chrome color once the page has loaded.
export default function ThemeSync() {
  useEffect(() => applyTheme(readTheme()), []);
  return null;
}
