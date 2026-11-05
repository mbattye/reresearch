"use client";

import { useOptimistic, useTransition } from "react";
import { toggleFlag } from "@/app/actions";
import { BookmarkIcon, ExternalIcon, EyeOffIcon, HeartIcon } from "./icons";

type Flags = { liked: boolean; saved: boolean; hidden: boolean };

interface Props {
  paperId: string;
  liked: boolean;
  saved: boolean;
  hidden: boolean;
  absUrl: string;
}

export function ActionBar({ paperId, liked, saved, hidden, absUrl }: Props) {
  const [, startTransition] = useTransition();
  const [state, setOptimistic] = useOptimistic<Flags, Partial<Flags>>(
    { liked, saved, hidden },
    (s, patch) => ({ ...s, ...patch }),
  );

  const flip = (flag: keyof Flags) => {
    const value = !state[flag];
    startTransition(async () => {
      setOptimistic({ [flag]: value });
      await toggleFlag(paperId, flag, value);
    });
  };

  const btn = "flex items-center gap-1.5 rounded-full p-2 -m-2 text-[13px] transition-colors";

  return (
    <div className="mt-3 flex max-w-sm items-center justify-between text-muted">
      <button
        type="button"
        onClick={() => flip("liked")}
        className={`${btn} ${state.liked ? "text-like" : "hover:text-like"}`}
        aria-pressed={state.liked}
        aria-label="Like"
      >
        <HeartIcon className="size-[18px]" filled={state.liked} />
      </button>
      <button
        type="button"
        onClick={() => flip("saved")}
        className={`${btn} ${state.saved ? "text-save" : "hover:text-save"}`}
        aria-pressed={state.saved}
        aria-label="Save for later"
      >
        <BookmarkIcon className="size-[18px]" filled={state.saved} />
      </button>
      <button
        type="button"
        onClick={() => flip("hidden")}
        className={`${btn} ${state.hidden ? "text-fg" : "hover:text-fg"}`}
        aria-pressed={state.hidden}
        aria-label={state.hidden ? "Show again" : "Less like this"}
        title={state.hidden ? "Show again" : "Less like this"}
      >
        <EyeOffIcon className="size-[18px]" />
        {state.hidden && <span>Hidden</span>}
      </button>
      <a href={absUrl} target="_blank" rel="noreferrer" className={`${btn} hover:text-accent`} aria-label="Open on arXiv">
        <ExternalIcon className="size-[18px]" />
      </a>
    </div>
  );
}
