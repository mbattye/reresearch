import type { Metadata } from "next";
import { Suspense } from "react";
import { ConfirmLink } from "./ConfirmLink";

export const metadata: Metadata = { title: "Sign in · reresearch" };

export default function ConfirmPage() {
  return (
    <main className="flex min-h-dvh flex-col justify-center px-8">
      <h1 className="text-[26px] font-bold tracking-tight">
        re<span className="text-accent">research</span>
      </h1>
      <Suspense>
        <ConfirmLink />
      </Suspense>
    </main>
  );
}
