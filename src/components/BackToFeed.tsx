"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { BackIcon } from "./icons";

const FEED_SEEN = "reresearch:feed-seen";

/** Rendered on the feed, so pages opened from it know going back will return there. */
export function RememberFeed() {
  useEffect(() => {
    try {
      sessionStorage.setItem(FEED_SEEN, "1");
    } catch {}
  }, []);
  return null;
}

/** Goes back through history when it can, keeping the reader's place, tab and topic in the feed. */
export function BackToFeed() {
  const router = useRouter();
  return (
    <Link
      href="/"
      className="-m-2 p-2"
      aria-label="Back to feed"
      onClick={(e) => {
        try {
          if (!sessionStorage.getItem(FEED_SEEN)) return;
        } catch {
          return;
        }
        e.preventDefault();
        router.back();
      }}
    >
      <BackIcon className="size-5" />
    </Link>
  );
}
