"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { dismissWelcome, fetchPapers, type FetchState } from "@/app/actions";
import type { Provider } from "@/lib/db/schema";
import { PROVIDERS } from "@/lib/providers";
import { RefreshIcon } from "./icons";
import { ApiKeyForm } from "./ApiKeyForm";

const primary =
  "inline-flex items-center justify-center gap-2 rounded-full bg-fg px-4 py-2 text-[14px] font-semibold text-bg transition hover:opacity-90 active:scale-95 disabled:opacity-60";
const secondary = "rounded-full px-4 py-2 text-center text-[14px] text-muted transition hover:bg-raised hover:text-fg";

/** First visit to the feed: add a key, then fetch. Closing it any way counts as seen, so it won't come back. */
export function Welcome({ hasKey }: { hasKey: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  }, []);
  const close = () => dialog.current?.close();

  return (
    <dialog
      ref={dialog}
      aria-labelledby="welcome-title"
      onClose={() => dismissWelcome()}
      className="m-auto w-[calc(100%-32px)] max-w-md rounded-2xl border border-line bg-bg p-5 text-fg shadow-xl backdrop:bg-black/60"
    >
      {hasKey ? <FirstFetch close={close} /> : <AddKey close={close} />}
    </dialog>
  );
}

function AddKey({ close }: { close: () => void }) {
  const [provider, setProvider] = useState<Provider>("anthropic");
  const chosen = PROVIDERS.find((p) => p.id === provider) ?? PROVIDERS[0];
  return (
    <>
      <h2 id="welcome-title" className="text-[19px] font-bold">
        Welcome to reresearch
      </h2>
      <p className="mt-2 text-[14px] leading-snug">
        New papers become short threads, written by an AI model using your own API key. Your feed stays empty until you
        add one.
      </p>
      <p className="mt-2 text-[14px] leading-snug text-muted">
        You pay your provider directly: about 6¢ a thread on the default model, under 1¢ on the cheapest. Your key is
        encrypted and never shown again.
      </p>
      <a href="/api/openrouter/start?from=welcome" className={`${primary} mt-4 w-full`}>
        Connect OpenRouter
      </a>
      <p className="mt-1.5 text-[12.5px] leading-snug text-muted">
        The easiest start: sign in or sign up at OpenRouter (Google works) and add a few dollars of credit. One account
        covers Claude, GPT, Gemini and Grok, and nothing needs copying.
      </p>
      <fieldset className="mt-4">
        <legend className="text-[13px] font-medium text-muted">Or paste a key you already have</legend>
        <div className="mt-1 grid grid-cols-3 gap-2">
          {PROVIDERS.map((p) => (
            <label
              key={p.id}
              className="flex items-center justify-center rounded-lg border border-line px-1 py-2 text-[13.5px] has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent"
            >
              <input
                type="radio"
                name="welcomeProvider"
                checked={provider === p.id}
                onChange={() => setProvider(p.id)}
                className="sr-only"
              />
              {p.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="mt-3">
        <ApiKeyForm key={provider} provider={chosen} hint={null} from="welcome" />
      </div>
      <button type="button" onClick={close} className={`${secondary} mt-3 w-full`}>
        Skip for now
      </button>
    </>
  );
}

function FirstFetch({ close }: { close: () => void }) {
  const [state, action, pending] = useActionState<FetchState, FormData>(fetchPapers, null);
  if (state) {
    return (
      <>
        <h2 id="welcome-title" className="text-[19px] font-bold">
          {state.ok ? "On its way" : "That didn't work"}
        </h2>
        <p className="mt-2 text-[14px] leading-snug">{state.message}</p>
        <button type="button" onClick={close} className={`${primary} mt-4 w-full`}>
          Go to my feed
        </button>
      </>
    );
  }
  return (
    <>
      <h2 id="welcome-title" className="text-[19px] font-bold">
        You&apos;re ready to go
      </h2>
      <p className="mt-2 text-[14px] leading-snug">
        Every morning reresearch fetches new papers and writes up the best few. You start with particle physics, quantum
        and fusion. AI, chemistry, biology, your interests and how much background threads assume are all in Settings.
      </p>
      <form action={action} className="mt-4">
        <button disabled={pending} className={`${primary} w-full`}>
          {pending && <RefreshIcon className="size-4 animate-spin" />}
          {pending ? "Fetching…" : "Fetch my first papers"}
        </button>
      </form>
      <Link href="/settings" onClick={close} className={`${secondary} mt-2 block`}>
        Choose topics first
      </Link>
    </>
  );
}
