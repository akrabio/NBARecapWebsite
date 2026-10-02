"use client";

import Link, { useLinkStatus } from "next/link";
import { navState } from "@/lib/navState";

// Thin bar across the top of the screen while the tapped game loads. The
// current page stays visible meanwhile (no skeleton), so the desktop list
// column doesn't flash between games.
function LoadingBar() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 origin-right bg-brand transition-[transform,opacity] duration-700 ease-out ${
        pending ? "scale-x-[0.85] opacity-100" : "scale-x-0 opacity-0"
      }`}
    />
  );
}

// Link to a game page that remembers it was opened from the list, so the
// game page's back button can return here (with scroll position) via history.
export default function GameLink({ gameId, selected = false, className, style, children }) {
  return (
    <Link
      href={`/game/${gameId}`}
      aria-current={selected ? "page" : undefined}
      className={className}
      style={style}
      onClick={() => {
        navState.cameFromList = true;
      }}
    >
      {children}
      <LoadingBar />
    </Link>
  );
}
