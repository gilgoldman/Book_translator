import { google, type GoogleEmbeddingModelOptions } from "@ai-sdk/google";
import {
  customProvider,
  defaultSettingsMiddleware,
  wrapLanguageModel,
  type LanguageModelMiddleware,
} from "ai";
import { isAiBusy } from "./errors";

// The only file that knows which LLM vendor we use. The rest of the app asks for
// a model by role. To switch vendors, install its @ai-sdk/* package and change
// the models below; prompts and schemas stay the same.
//
// Gemini 3.x notes: temperature/top_p are ignored, depth is set with thinkingLevel.

const MODEL_ID = process.env.LLM_MODEL ?? "gemini-3.8-flash";
// Used when the main model is overloaded (503) or out of quota (429).
const FALLBACK_MODEL_ID = process.env.LLM_FALLBACK_MODEL ?? "gemini-3.5-flash";

/**
 * Attempts per call on top of the first (waits 2 s, 4 s). Kept short on purpose: the backup
 * model handles overload, and the chat bot retries whole imports on top of this.
 */
export const AI_MAX_RETRIES = 2;

type ThinkingLevel = "low" | "medium" | "high";

function gemini(modelId: string, thinkingLevel: ThinkingLevel, mediaResolution?: string) {
  return wrapLanguageModel({
    model: google(modelId),
    middleware: defaultSettingsMiddleware({
      settings: {
        providerOptions: {
          google: {
            thinkingConfig: { thinkingLevel },
            ...(mediaResolution ? { mediaResolution } : {}),
          },
        },
      },
    }),
  });
}

// After the main model says it's busy, skip it for a while so the next calls
// (and the retries of this one) go straight to the backup instead of waiting on a 503.
const COOLDOWN_MS = 2 * 60_000;
let primaryBusyUntil = 0;

/** Tries the wrapped model; if it's busy, answers with `backup` instead. */
export function fallbackTo(backup: ReturnType<typeof wrapLanguageModel>, now = () => Date.now()): LanguageModelMiddleware {
  return {
    specificationVersion: "v4",
    wrapGenerate: async ({ doGenerate, params, model }) => {
      if (now() < primaryBusyUntil) return backup.doGenerate(params);
      try {
        return await doGenerate();
      } catch (err) {
        if (!isAiBusy(err)) throw err;
        primaryBusyUntil = now() + COOLDOWN_MS;
        console.warn(`${model.modelId} is busy; using ${backup.modelId} for the next few minutes`);
        return backup.doGenerate(params);
      }
    },
    wrapStream: async ({ doStream, params }) => {
      if (now() < primaryBusyUntil) return backup.doStream(params);
      try {
        return await doStream();
      } catch (err) {
        if (!isAiBusy(err)) throw err;
        primaryBusyUntil = now() + COOLDOWN_MS;
        return backup.doStream(params);
      }
    },
  };
}

/** For tests. */
export function resetFallbackCooldown() {
  primaryBusyUntil = 0;
}

function withFallback(thinkingLevel: ThinkingLevel, mediaResolution?: string) {
  return wrapLanguageModel({
    model: gemini(MODEL_ID, thinkingLevel, mediaResolution),
    middleware: fallbackTo(gemini(FALLBACK_MODEL_ID, thinkingLevel, mediaResolution)),
  });
}

export const ai = customProvider({
  languageModels: {
    // Faithful transcription of photos, audio, pages. High resolution for dense screenshots.
    extract: withFallback("low", "MEDIA_RESOLUTION_HIGH"),
    // Rewriting into the Effective view and working out Ruhlman ratios.
    enrich: withFallback("medium"),
    // Translating a recipe's words into the other app languages.
    translate: withFallback("low"),
    // Small, fast jobs (query understanding, chat bot replies).
    quick: withFallback("low"),
  },
  embeddingModels: {
    text: google.embedding(process.env.EMBEDDING_MODEL ?? "gemini-embedding-2"),
  },
});

// Changing the embedding model or dimensions requires `npm run reembed`.
export const embeddingOptions = {
  google: { outputDimensionality: 768 } satisfies GoogleEmbeddingModelOptions,
};
