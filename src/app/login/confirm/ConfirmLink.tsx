"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

export function ConfirmLink() {
  const token = useSearchParams().get("token");
  if (!token) {
    return (
      <p className="mt-4 text-[15px]">
        That link isn&apos;t complete.{" "}
        <Link href="/login" className="font-medium text-accent">
          Get a new one
        </Link>
      </p>
    );
  }
  const params = new URLSearchParams({ token, callbackURL: "/", errorCallbackURL: "/login?link=expired" });
  return (
    <>
      <p className="mt-3 text-[15px] leading-snug">One more tap and you&apos;re in.</p>
      {/* A plain link on purpose: this is the step automated email scanners don't take. */}
      <a
        href={`/api/auth/magic-link/verify?${params}`}
        className="mt-6 block w-full rounded-full bg-fg py-2.5 text-center text-[15px] font-semibold text-bg transition hover:opacity-90 active:scale-[0.98]"
      >
        Continue to reresearch
      </a>
    </>
  );
}
