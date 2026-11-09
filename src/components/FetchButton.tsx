"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { fetchPapers, type FetchState } from "@/app/actions";
import { RefreshIcon } from "./icons";

const NOTICE = "reresearch:fetch-notice";

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
  // From elsewhere, a fetch that's writing threads takes the reader to where they'll appear.
  const jumping = !!state?.ok && !!state.writing && !onFeed;
  const toast = state && state !== dismissed && !jumping ? state : null;

  useEffect(() => {
    if (!state) return;
    if (jumping) {
      try {
        sessionStorage.setItem(NOTICE, state.message);
      } catch {}
      router.push("/");
      return;
    }
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
  }, [state, router, onFeed, jumping]);

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
      {toast && (
        <Toast ok={toast.ok} message={toast.message} onDismiss={() => setDismissed(state)}>
          {toast.ok && !onFeed && (
            <Link href="/" className="mt-1.5 inline-block font-semibold underline underline-offset-2">
              Jump to For you
            </Link>
          )}
        </Toast>
      )}
    </>
  );
}

/** On the feed: says what a fetch started elsewhere found, and keeps refreshing while its threads land. */
export function FetchNotice() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = sessionStorage.getItem(NOTICE);
    } catch {}
    if (!saved) return;
    const text = saved;
    const show = setTimeout(() => {
      try {
        sessionStorage.removeItem(NOTICE);
      } catch {}
      setMessage(text);
    }, 0);
    const hide = setTimeout(() => setMessage(null), 12_000);
    const tick = setInterval(() => router.refresh(), 6000);
    const stop = setTimeout(() => clearInterval(tick), 150_000);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
      clearInterval(tick);
      clearTimeout(stop);
    };
  }, [router]);

  return message ? <Toast ok message={message} onDismiss={() => setMessage(null)} /> : null;
}

function Toast({
  ok,
  message,
  onDismiss,
  children,
}: {
  ok: boolean;
  message: string;
  onDismiss: () => void;
  children?: React.ReactNode;
}) {
  // Portalled to <body>: the sticky header's backdrop blur would otherwise pin "fixed" to the header.
  return createPortal(
    <div
      role="status"
      className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-[max(16px,env(safe-area-inset-bottom))]"
    >
      <div
        className={`flex max-w-md items-start gap-3 rounded-2xl px-4 py-3 text-[14px] shadow-lg ${
          ok ? "bg-fg text-bg" : "bg-like text-white"
        }`}
      >
        <div>
          <p className="leading-snug">{message}</p>
          {children}
        </div>
        <button type="button" onClick={onDismiss} aria-label="Dismiss" className="-m-1 shrink-0 rounded-full p-1 opacity-70 hover:opacity-100">
          ✕
        </button>
      </div>
    </div>,
    document.body,
  );
}
