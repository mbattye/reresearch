import Link from "next/link";
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
      <p className="mt-6 text-[12.5px] text-muted">
        <Link href="/privacy" className="hover:underline">
          Privacy
        </Link>
        {" · "}
        <a href="https://github.com/mbattye/reresearch" target="_blank" rel="noreferrer" className="hover:underline">
          Open source
        </a>
      </p>
      <p className="mt-2 text-[11.5px] leading-snug text-muted">
        Papers via arXiv, bioRxiv, OpenAlex, INSPIRE-HEP and Semantic Scholar. Thank you to arXiv for use of its open access
        interoperability. reresearch isn&apos;t affiliated with or endorsed by any of them.
      </p>
    </main>
  );
}
