import { beforeEach, describe, expect, it, vi } from "vitest";

// Telegram's webhook door: only Telegram (which knows the secret) gets in, gets its answer at
// once, and the update is handled after the response.

vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/channels/telegram/webhook", () => ({ handleUpdate: vi.fn(async () => {}) }));

const { POST, maxDuration } = await import("./route");
const { after } = await import("next/server");
const { handleUpdate } = await import("@/lib/channels/telegram/webhook");

const update = { message: { message_id: 1, chat: { id: 9, type: "private" }, text: "leeks" } };
const post = (secret?: string) =>
  POST(
    new Request("https://book.test/api/telegram", {
      method: "POST",
      headers: secret === undefined ? {} : { "x-telegram-bot-api-secret-token": secret },
      body: JSON.stringify(update),
    }),
  );
/** Runs what the route left for after the response. */
const runAfter = () => (vi.mocked(after).mock.calls[0][0] as () => Promise<void>)();

beforeEach(() => {
  vi.clearAllMocks();
  process.env.TELEGRAM_WEBHOOK_SECRET = "s3cret";
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("the Telegram webhook", () => {
  it("turns away requests without the right secret", async () => {
    for (const secret of [undefined, "", "wrong!", "s3cre", "s3cret-and-more"]) {
      const res = await post(secret);
      expect(res.status, String(secret)).toBe(403);
    }
    expect(after).not.toHaveBeenCalled();
  });

  it("turns everyone away while no secret is set", async () => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    expect((await post("s3cret")).status).toBe(403);
  });

  it("answers Telegram at once and handles the update afterwards", async () => {
    const res = await post("s3cret");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(handleUpdate).not.toHaveBeenCalled();
    await runAfter();
    expect(handleUpdate).toHaveBeenCalledWith(update);
  });

  it("logs an update that fails, instead of throwing", async () => {
    vi.mocked(handleUpdate).mockRejectedValueOnce(new Error("boom"));
    await post("s3cret");
    await expect(runAfter()).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith("telegram update failed", expect.any(Error));
  });

  it("has time for slow imports", () => {
    expect(maxDuration).toBe(300);
  });
});
