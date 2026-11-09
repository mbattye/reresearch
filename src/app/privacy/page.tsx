import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacy · reresearch" };

const CONTACT = "privacy@reresearch.app";
const h2 = "mt-6 text-[16px] font-semibold";
const p = "mt-2 text-[14.5px] leading-relaxed";
const ul = "mt-2 list-disc space-y-1.5 pl-5 text-[14.5px] leading-relaxed";

export default function PrivacyPage() {
  return (
    <main className="px-5 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-12">
      <Link href="/" className="text-[17px] font-bold tracking-tight">
        re<span className="text-accent">research</span>
      </Link>
      <h1 className="mt-5 text-[24px] font-bold tracking-tight">Privacy</h1>
      <p className="mt-1 text-[13px] text-muted">Last updated 8 November 2026</p>

      <p className={p}>
        reresearch is run by Mike Battye as a personal project. This page says what it stores about you, why, and how to
        get rid of it. Questions or requests: <a href={`mailto:${CONTACT}`} className="text-accent underline">{CONTACT}</a>.
      </p>

      <h2 className={h2}>What&apos;s stored</h2>
      <ul className={ul}>
        <li>
          <strong>Your email address</strong>, to sign you in and send you links. If you ask for access, it&apos;s kept on the
          waitlist. There are no passwords.
        </li>
        <li>
          <strong>Your AI key</strong>, if you add one. It&apos;s encrypted, used only to write your threads, and never shown
          again. Only its last four characters are kept readable, so you can tell which key is saved.
        </li>
        <li>
          <strong>What you do in the app</strong>: your topics, interests and settings, what you like, save, hide and
          read, what your ranking has learned, and what your key has spent.
        </li>
        <li>
          <strong>Sign-in details</strong>: the IP address and browser your session started from, kept until the session
          ends (90 days at most).
        </li>
        <li>
          <strong>Rate-limiting records</strong>: your IP address or email against recent sign-in attempts, kept for about a
          day to stop abuse.
        </li>
      </ul>

      <h2 className={h2}>Why, and the legal basis</h2>
      <p className={p}>
        Your account data is needed to provide the service you signed up for (performing a contract). Security records and
        the waitlist are kept because there&apos;s a legitimate interest in preventing abuse and managing access. Your data is
        not sold, and it isn&apos;t used for advertising.
      </p>

      <h2 className={h2}>Who else handles it</h2>
      <ul className={ul}>
        <li>
          <strong>Vercel</strong> hosts the app, <strong>Neon</strong> hosts the database, and <strong>Resend</strong>{" "}
          sends the emails. They process data on reresearch&apos;s behalf, and may do so outside the UK.
        </li>
        <li>
          <strong>Your AI provider</strong> (Anthropic, OpenAI or OpenRouter, whichever you choose) receives each paper and
          the writing instructions, under your own account and its own terms. Your email isn&apos;t included.
        </li>
        <li>
          <strong>Research databases</strong> (arXiv, bioRxiv, OpenAlex, INSPIRE and Semantic Scholar) receive requests for
          papers. Semantic Scholar also receives the ids of papers you&apos;ve liked, saved or hidden, to suggest similar ones.
          None of these requests include your name or email.
        </li>
      </ul>
      <p className={p}>
        Written threads are shared between readers at the same reading level. Other readers can&apos;t see who paid for one.
      </p>

      <h2 className={h2}>Cookies</h2>
      <p className={p}>
        One essential cookie keeps you signed in. Your browser also remembers small conveniences, such as having seen the
        Settings tour. There are no advertising or analytics cookies, and no tracking.
      </p>

      <h2 className={h2}>How long it&apos;s kept, and deleting it</h2>
      <p className={p}>
        Your data is kept until you delete your account: Settings → Your data → Delete my account. That immediately removes
        your email, key, sessions, settings and reading history. Threads your key paid for stay available to other readers,
        with no link to you. Deleted data can stay in database backups for a short time before it&apos;s overwritten.
      </p>
      <p className={p}>
        If you asked for access and don&apos;t have an account, your email stays on the waitlist until you&apos;re approved, or until
        you ask for it to be removed. A declined request is kept so you aren&apos;t asked about again.
      </p>

      <h2 className={h2}>Your rights</h2>
      <p className={p}>
        Under UK data protection law you can ask for a copy of your data, have it corrected or deleted, restrict or object
        to its use, and take it elsewhere. Email <a href={`mailto:${CONTACT}`} className="text-accent underline">{CONTACT}</a>{" "}
        to do any of these. If you&apos;re unhappy with the response, you can complain to the{" "}
        <a href="https://ico.org.uk/make-a-complaint/" target="_blank" rel="noreferrer" className="text-accent underline">
          Information Commissioner&apos;s Office
        </a>
        .
      </p>

      <h2 className={h2}>Open source</h2>
      <p className={p}>
        You can read exactly how all of this works in{" "}
        <a href="https://github.com/mbattye/reresearch" target="_blank" rel="noreferrer" className="text-accent underline">
          the code
        </a>
        .
      </p>
    </main>
  );
}
