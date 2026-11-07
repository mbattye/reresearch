import type { Provider } from "./db/schema";

export interface ProviderInfo {
  id: Provider;
  label: string;
  /** Under the name in the model picker. */
  models: string;
  placeholder: string;
  keyUrl: string;
  keySite: string;
  note: string;
}

/** Where readers can get a key. Usable from client components. */
export const PROVIDERS: ProviderInfo[] = [
  {
    id: "anthropic",
    label: "Anthropic",
    models: "Claude, with half-price batches",
    placeholder: "sk-ant-…",
    keyUrl: "https://platform.claude.com/settings/keys",
    keySite: "platform.claude.com",
    note: "The account needs some credit.",
  },
  {
    id: "openai",
    label: "OpenAI",
    models: "GPT",
    placeholder: "sk-…",
    keyUrl: "https://platform.openai.com/api-keys",
    keySite: "platform.openai.com",
    note: "This is separate from ChatGPT, and the account needs some credit.",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    models: "Claude, GPT, Gemini, Grok…",
    placeholder: "sk-or-…",
    keyUrl: "https://openrouter.ai/keys",
    keySite: "openrouter.ai",
    note: "One key for Claude, GPT, Gemini, Grok and more.",
  },
];

export function providerLabel(provider: Provider): string {
  return PROVIDERS.find((p) => p.id === provider)?.label ?? provider;
}
