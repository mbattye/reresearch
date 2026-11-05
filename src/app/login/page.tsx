import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh flex-col justify-center px-8">
      <h1 className="text-[26px] font-bold tracking-tight">
        re<span className="text-accent">research</span>
      </h1>
      <p className="mt-1 text-[14px] text-muted">New papers, read as threads.</p>
      <LoginForm />
    </main>
  );
}
