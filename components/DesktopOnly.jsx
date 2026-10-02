"use client";

import { useEffect, useState } from "react";

// Mounts children only from the lg breakpoint up, so phones don't render (or
// fetch data for) desktop-only panes.
export default function DesktopOnly({ children, fallback = null }) {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return isDesktop ? children : fallback;
}
