"use client";

import { useEffect, useState } from "react";

// Minimal global toast: call toast("…") from anywhere on the client.
const listeners = new Set();

export function toast(message) {
  listeners.forEach((listener) => listener(message));
}

export default function Toaster() {
  const [message, setMessage] = useState(null);

  useEffect(() => {
    let timer;
    const show = (text) => {
      setMessage(text);
      clearTimeout(timer);
      timer = setTimeout(() => setMessage(null), 1800);
    };
    listeners.add(show);
    return () => {
      listeners.delete(show);
      clearTimeout(timer);
    };
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-none fixed left-1/2 bottom-[calc(24px+env(safe-area-inset-bottom))] z-[99] -translate-x-1/2 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-app transition-all duration-200 ${
        message ? "opacity-100" : "translate-y-5 opacity-0"
      }`}
    >
      {message}
    </div>
  );
}
