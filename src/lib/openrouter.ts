import { cacheLife } from "next/cache";

export interface OpenRouterModel {
  id: string;
  name: string;
  /** USD per million tokens. */
  input: number;
  output: number;
}

// Makers worth offering for writing threads; the full catalogue is hundreds of models.
const MAKERS = ["anthropic/", "openai/", "google/", "x-ai/", "mistralai/", "deepseek/", "qwen/", "meta-llama/"];

/** Models on OpenRouter that can return a structured thread, cached for an hour. */
export async function getOpenRouterModels(): Promise<OpenRouterModel[]> {
  "use cache";
  cacheLife("hours");
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return [];
    const { data } = (await res.json()) as {
      data: {
        id: string;
        name: string;
        created?: number;
        pricing?: { prompt?: string; completion?: string };
        supported_parameters?: string[];
      }[];
    };
    return data
      .filter(
        (m) =>
          MAKERS.some((p) => m.id.startsWith(p)) &&
          !m.id.includes(":") &&
          (m.supported_parameters ?? []).includes("structured_outputs"),
      )
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((m) => ({
        id: m.id,
        name: m.name,
        input: Number(m.pricing?.prompt ?? 0) * 1e6,
        output: Number(m.pricing?.completion ?? 0) * 1e6,
      }));
  } catch {
    return [];
  }
}
