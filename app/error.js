"use client";

import { startTransition, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

// Shown when a page fails to render (e.g. the database is unreachable).
export default function Error({ error, reset }) {
  const router = useRouter();

  useEffect(() => {
    console.error(error);
  }, [error]);

  // Re-fetch the server data, then re-render the failed segment.
  const retry = () =>
    startTransition(() => {
      router.refresh();
      reset();
    });

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 text-center">
      <div>
        <h1 className="mb-2 text-2xl font-black">משהו השתבש</h1>
        <p className="mx-auto mb-8 max-w-sm leading-relaxed text-subtle">לא הצלחנו לטעון את הדף. נסו שוב בעוד רגע.</p>
        <div className="flex justify-center gap-2">
          <button
            onClick={retry}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand px-5 font-bold text-on-brand"
          >
            <RefreshCw className="h-5 w-5" />
            נסו שוב
          </button>
          <Link href="/" className="inline-flex h-11 items-center rounded-xl border bg-surface px-5 font-bold">
            לכל הסיכומים
          </Link>
        </div>
      </div>
    </main>
  );
}
