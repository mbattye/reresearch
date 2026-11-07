"use client";

import { useState } from "react";
import type { Provider } from "@/lib/db/schema";
import type { OpenRouterModel } from "@/lib/openrouter";
import { PROVIDERS } from "@/lib/providers";

type ListedModel = { id: string; label: string; note: string };

interface Props {
  provider: Provider;
  model: string;
  anthropicModels: ListedModel[];
  openaiModels: ListedModel[];
  openrouterModels: OpenRouterModel[];
  hasKey: Record<Provider, boolean>;
}

/** Provider choice, then that provider's models. Submits summaryProvider + summaryModel / openrouterModel. */
export function ModelPicker({ provider: initialProvider, model, anthropicModels, openaiModels, openrouterModels, hasKey }: Props) {
  const [provider, setProvider] = useState<Provider>(initialProvider);
  const orDefault = initialProvider === "openrouter" ? model : "anthropic/claude-sonnet-5.5";
  const listed = provider === "openai" ? openaiModels : anthropicModels;
  const listedDefault = provider === "openai" ? "gpt-6.1-sol" : "claude-sonnet-5-5";
  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        {PROVIDERS.map((p) => (
          <label
            key={p.id}
            className="flex cursor-pointer flex-col rounded-lg border border-line px-2.5 py-2 text-[13.5px] has-[:checked]:border-accent has-[:checked]:bg-accent-soft"
          >
            <span className="flex items-center gap-2">
              <input
                type="radio"
                name="summaryProvider"
                value={p.id}
                checked={provider === p.id}
                onChange={() => setProvider(p.id)}
                className="size-3.5 accent-[var(--accent)]"
              />
              {p.label}
            </span>
            <span className="mt-0.5 text-[12px] leading-snug text-muted">
              {p.models}
              {!hasKey[p.id] && " · no key yet"}
            </span>
          </label>
        ))}
      </div>

      {provider !== "openrouter" ? (
        <div key={provider} className="mt-3 grid gap-1">
          {listed.map((m) => (
            <label key={m.id} className="flex items-center gap-3 rounded-lg px-1 py-1.5 text-[14px] hover:bg-raised">
              <input
                type="radio"
                name="summaryModel"
                value={m.id}
                defaultChecked={initialProvider === provider ? model === m.id : m.id === listedDefault}
                className="size-4 accent-[var(--accent)]"
              />
              <span>{m.label}</span>
              <span className="ml-auto text-[12.5px] text-muted">{m.note}</span>
            </label>
          ))}
        </div>
      ) : (
        <label className="mt-3 block text-[13px] text-muted">
          Model
          {openrouterModels.length ? (
            <select
              name="openrouterModel"
              defaultValue={orDefault}
              className="mt-1 w-full rounded-lg border border-line bg-bg px-3 py-2 text-[14px] text-fg"
            >
              {!openrouterModels.some((m) => m.id === orDefault) && <option value={orDefault}>{orDefault}</option>}
              {openrouterModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} · ${m.input.toFixed(2)} / ${m.output.toFixed(2)} per M tokens
                </option>
              ))}
            </select>
          ) : (
            <input
              name="openrouterModel"
              defaultValue={orDefault}
              placeholder="anthropic/claude-sonnet-5.5"
              className="mt-1 w-full rounded-lg border border-line bg-bg px-3 py-2 font-mono text-[14px] text-fg"
            />
          )}
          <span className="mt-1 block text-[12px]">
            Only models that return structured output are listed. OpenRouter reads the extracted text and writes live
            (no half-price batch).
          </span>
        </label>
      )}
    </div>
  );
}
