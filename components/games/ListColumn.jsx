"use client";

import { useEffect, useRef } from "react";

// The list column. On phones it is the page; from lg up it is a fixed-height
// sidebar with its own scroll, which is remembered across game clicks (each
// click renders a new page, so the column would otherwise reset to the top).
const STORAGE_KEY = "list-column-scroll";

export default function ListColumn({ scrollKey, className = "", children }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null");
      if (saved?.key === scrollKey) el.scrollTop = saved.top;
    } catch {}
    const onScroll = () => {
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ key: scrollKey, top: el.scrollTop }));
      } catch {}
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [scrollKey]);

  return (
    <div
      ref={ref}
      className={`lg:sticky lg:top-0 lg:h-dvh lg:overflow-y-auto lg:overscroll-contain lg:border-e ${className}`}
    >
      {children}
    </div>
  );
}
