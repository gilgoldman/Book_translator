import { google, type GoogleEmbeddingModelOptions } from "@ai-sdk/google";
import { customProvider, defaultSettingsMiddleware, wrapLanguageModel } from "ai";

// The only file that knows which LLM vendor we use. The rest of the app asks for
// a model by role. To switch vendors, install its @ai-sdk/* package and change
// the models below; prompts and schemas stay the same.
//
// Gemini 3.x notes: temperature/top_p are ignored, depth is set with thinkingLevel.

const MODEL_ID = process.env.LLM_MODEL ?? "gemini-3.8-flash";

function gemini(thinkingLevel: "low" | "medium" | "high", mediaResolution?: string) {
  return wrapLanguageModel({
    model: google(MODEL_ID),
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

export const ai = customProvider({
  languageModels: {
    // Faithful transcription of photos, audio, pages. High resolution for dense screenshots.
    extract: gemini("low", "MEDIA_RESOLUTION_HIGH"),
    // Rewriting into the Effective view and working out Ruhlman ratios.
    enrich: gemini("medium"),
    // Translating a recipe's words into the other app languages.
    translate: gemini("low"),
    // Small, fast jobs (query understanding, Telegram replies).
    quick: gemini("low"),
  },
  embeddingModels: {
    text: google.embedding(process.env.EMBEDDING_MODEL ?? "gemini-embedding-2"),
  },
});

// Changing the embedding model or dimensions requires `npm run reembed`.
export const embeddingOptions = {
  google: { outputDimensionality: 768 } satisfies GoogleEmbeddingModelOptions,
};
