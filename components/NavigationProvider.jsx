"use client";

import { createContext, useCallback, useContext, useTransition } from "react";
import { useRouter } from "next/navigation";

// Wraps router navigation in a transition so the current list stays on screen
// (dimmed) while the next date/team renders on the server.
const NavigationContext = createContext({ navigate: () => {}, refresh: () => {}, pending: false });

export function NavigationProvider({ children }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const navigate = useCallback(
    (href) => startTransition(() => router.push(href)),
    [router]
  );

  // Re-render the current page on the server (e.g. after a cookie changes)
  const refresh = useCallback(() => startTransition(() => router.refresh()), [router]);

  return (
    <NavigationContext.Provider value={{ navigate, refresh, pending }}>
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation() {
  return useContext(NavigationContext);
}

export function PendingFade({ children }) {
  const { pending } = useNavigation();
  return (
    <div aria-busy={pending} className={`transition-opacity duration-150 ${pending ? "opacity-50" : ""}`}>
      {children}
    </div>
  );
}
