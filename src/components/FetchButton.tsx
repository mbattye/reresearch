"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { fetchPapers, type FetchState } from "@/app/actions";
import { RefreshIcon } from "./icons";

/**
 * Fetches new papers in place: a pending state while it runs, then a toast saying what it
 * found. The feed keeps refreshing for a couple of minutes while the write-ups land.
 */
export function FetchButton({ variant = "pill" }: { variant?: "pill" | "icon" }) {
  const router = useRouter();
  const onFeed = usePathname() === "/";
  const [state, action, pending] = useActionState<FetchState, FormData>(fetchPapers, null);
  // The toast is the latest result until it is dismissed or times out.
  const [dismissed, setDismissed] = useState<FetchState>(null);
  const toast = state && state !== dismissed ? state : null;

  useEffect(() => {
    if (!state) return;
    // Longer away from the feed: there's a link to follow, and the page gives no other sign it worked.
    const hide = setTimeout(() => setDismissed(state), onFeed ? 8000 : 30_000);
    if (!state.ok) return () => clearTimeout(hide);
    const tick = setInterval(() => router.refresh(), 6000);
    const stop = setTimeout(() => clearInterval(tick), 150_000);
    return () => {
      clearTimeout(hide);
      clearInterval(tick);
      clearTimeout(stop);
    };
  }, [state, router, onFeed]);

  return (
    <>
      <form action={action}>
        {variant === "icon" ? (
          <button
            disabled={pending}
            aria-label={pending ? "Fetching new papers" : "Fetch new papers"}
            title="Fetch new papers"
            className="-m-2 rounded-full p-2 text-muted transition hover:bg-raised hover:text-fg focus-visible:ring-2 focus-visible:ring-accent active:scale-90 disabled:opacity-60"
          >
            <RefreshIcon className={`size-5 ${pending ? "animate-spin" : ""}`} />
          </button>
        ) : (
          <button
            disabled={pending}
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-fg px-4 py-1.5 text-[13px] font-semibold whitespace-nowrap text-bg shadow-sm transition hover:opacity-85 hover:shadow focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg active:scale-95 disabled:opacity-60"
          >
            {pending && <RefreshIcon className="size-3.5 animate-spin" />}
            {pending ? "Fetching…" : "Fetch new"}
          </button>
        )}
      </form>
      {/* Portalled to <body>: the sticky header's backdrop blur would otherwise pin "fixed" to the header. */}
      {toast &&
        createPortal(
          <div
            role="status"
            className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-[max(16px,env(safe-area-inset-bottom))]"
          >
            <div
              className={`flex max-w-md items-start gap-3 rounded-2xl px-4 py-3 text-[14px] shadow-lg ${
                toast.ok ? "bg-fg text-bg" : "bg-like text-white"
              }`}
            >
              <div>
                <p className="leading-snug">{toast.message}</p>
                {toast.ok && !onFeed && (
                  <Link href="/" className="mt-1.5 inline-block font-semibold underline underline-offset-2">
                    Jump to For you
                  </Link>
                )}
              </div>
              <button
                type="button"
                onClick={() => setDismissed(state)}
                aria-label="Dismiss"
                className="-m-1 shrink-0 rounded-full p-1 opacity-70 hover:opacity-100"
              >
                ✕
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
