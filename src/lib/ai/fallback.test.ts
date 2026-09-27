import { APICallError, generateText, RetryError, wrapLanguageModel } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { beforeEach, describe, expect, it } from "vitest";
import { isAiBusy } from "./errors";
import { fallbackTo, resetFallbackCooldown } from "./models";

const apiError = (statusCode: number) =>
  new APICallError({
    message: statusCode === 503 ? "This model is currently experiencing high demand." : "Bad request",
    url: "https://example.test/v1beta/models/x:generateContent",
    requestBodyValues: {},
    statusCode,
    isRetryable: statusCode >= 500 || statusCode === 429,
  });

const reply = (text: string) => ({
  content: [{ type: "text" as const, text }],
  finishReason: { unified: "stop" as const, raw: "STOP" },
  usage: {
    inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 1, text: 1, reasoning: 0 },
  },
  warnings: [],
});

function models(primaryError: number | null) {
  const primary = new MockLanguageModelV4({
    modelId: "primary",
    doGenerate: async () => {
      if (primaryError) throw apiError(primaryError);
      return reply("from primary");
    },
  });
  const backup = new MockLanguageModelV4({ modelId: "backup", doGenerate: async () => reply("from backup") });
  const model = wrapLanguageModel({ model: primary, middleware: fallbackTo(wrapLanguageModel({ model: backup, middleware: [] })) });
  return { primary, backup, model };
}

describe("isAiBusy", () => {
  it("is true for overload and rate limits, also after retries", () => {
    expect(isAiBusy(apiError(503))).toBe(true);
    expect(isAiBusy(apiError(429))).toBe(true);
    const retry = new RetryError({ message: "Failed after 3 attempts", reason: "maxRetriesExceeded", errors: [apiError(503)] });
    expect(isAiBusy(retry)).toBe(true);
  });

  it("is false for bad requests and other errors", () => {
    expect(isAiBusy(apiError(400))).toBe(false);
    expect(isAiBusy(new Error("boom"))).toBe(false);
  });
});

describe("fallbackTo", () => {
  beforeEach(() => resetFallbackCooldown());

  it("uses the main model when it answers", async () => {
    const { model, backup } = models(null);
    const { text } = await generateText({ model, prompt: "hi", maxRetries: 0 });
    expect(text).toBe("from primary");
    expect(backup.doGenerateCalls).toHaveLength(0);
  });

  it("answers with the backup when the main model is overloaded, then skips the main model for a while", async () => {
    const { model, primary, backup } = models(503);
    expect((await generateText({ model, prompt: "hi", maxRetries: 0 })).text).toBe("from backup");
    expect((await generateText({ model, prompt: "again", maxRetries: 0 })).text).toBe("from backup");
    expect(primary.doGenerateCalls).toHaveLength(1);
    expect(backup.doGenerateCalls).toHaveLength(2);
  });

  it("does not hide real errors behind the backup", async () => {
    const { model, backup } = models(400);
    await expect(generateText({ model, prompt: "hi", maxRetries: 0 })).rejects.toThrow("Bad request");
    expect(backup.doGenerateCalls).toHaveLength(0);
  });
});
