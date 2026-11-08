"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, useTransition } from "react";
import { savePreferences } from "@/app/actions";

const ScheduleSave = createContext<() => void>(() => {});

/** For controls that change the form without a change event, like the "Add AI keywords" button. */
export function useScheduleSave() {
  return useContext(ScheduleSave);
}

// Typing waits for a pause; ticks, radios and the slider save straight away.
const TYPING_DELAY_MS = 800;

/**
 * The settings form, saved as you change it. Calls the action directly rather than submitting,
 * so React doesn't reset the form and wipe anything typed while a save is in flight.
 */
export function AutoSaveForm({ children }: { children: React.ReactNode }) {
  const form = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [saving, startSaving] = useTransition();
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");

  const save = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
    if (!form.current) return;
    const data = new FormData(form.current);
    startSaving(async () => {
      try {
        await savePreferences(data);
        setStatus("saved");
      } catch {
        setStatus("error");
      }
    });
  }, []);

  const schedule = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(save, TYPING_DELAY_MS);
  }, [save]);

  useEffect(() => {
    if (status !== "saved") return;
    const hide = setTimeout(() => setStatus("idle"), 2000);
    return () => clearTimeout(hide);
  }, [status]);

  // Don't lose a pending edit when leaving the page.
  useEffect(() => {
    const flush = () => timer.current && save();
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [save]);

  const onChange = (e: React.FormEvent<HTMLFormElement>) => {
    const el = e.target as HTMLInputElement;
    const typing = el.tagName === "TEXTAREA" || el.type === "text" || el.type === "number" || el.type === "search";
    if (typing) schedule();
    else save();
  };

  const label = saving ? "Saving…" : status === "saved" ? "Saved" : status === "error" ? "Couldn't save. Check your connection." : null;

  return (
    <ScheduleSave.Provider value={schedule}>
      <form
        ref={form}
        onChange={onChange}
        onBlur={() => timer.current && save()}
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        {children}
      </form>
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-[max(16px,env(safe-area-inset-bottom))]"
      >
        {label && (
          <span
            className={`rounded-full px-4 py-2 text-[13px] font-medium shadow-lg ${
              status === "error" && !saving ? "bg-like text-white" : "bg-fg text-bg"
            }`}
          >
            {label}
          </span>
        )}
      </div>
    </ScheduleSave.Provider>
  );
}
