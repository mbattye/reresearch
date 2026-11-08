import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh flex-col justify-center px-8">
      <h1 className="text-[26px] font-bold tracking-tight">
        re<span className="text-accent">research</span>
      </h1>
      <p className="mt-1 text-[14px] text-muted">New papers, read as threads.</p>
      <p className="mt-3 text-[14px] leading-snug">
        Pick your fields and how much background you have. Each morning the best new research is summarised into short,
        factual threads to read on your phone, using your own AI key.
      </p>
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
