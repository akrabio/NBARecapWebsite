"use client";

import { RefreshCw, WifiOff } from "lucide-react";

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 text-center">
      <div>
        <div className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-2xl bg-surface-2 text-subtle">
          <WifiOff className="h-8 w-8" />
        </div>
        <h1 className="mb-2 text-2xl font-black">אין חיבור לאינטרנט</h1>
        <p className="mx-auto mb-8 max-w-sm leading-relaxed text-subtle">
          בדקו את החיבור ונסו שוב.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand px-5 font-bold text-on-brand"
        >
          <RefreshCw className="h-5 w-5" />
          נסו שוב
        </button>
      </div>
    </main>
  );
}
