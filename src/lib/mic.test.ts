import { describe, expect, it } from "vitest";
import { isInAppBrowser, micProblem } from "./mic";

const chrome = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36";
const webview = "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0 Mobile Safari/537.36";
const instagram = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 340.0";
const safari = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

const error = (name: string, message = "") => Object.assign(new Error(message), { name });

describe("isInAppBrowser", () => {
  it("tells apps' built-in browsers from real ones", () => {
    expect(isInAppBrowser(webview)).toBe(true);
    expect(isInAppBrowser(instagram)).toBe(true);
    expect(isInAppBrowser(chrome)).toBe(false);
    expect(isInAppBrowser(safari)).toBe(false);
  });
});

describe("micProblem", () => {
  it("says why the microphone was refused", () => {
    expect(micProblem(error("NotAllowedError", "Permission denied"), chrome)).toBe("blocked");
    expect(micProblem(error("NotAllowedError", "Permission denied by system"), chrome)).toBe("system");
    expect(micProblem(error("NotAllowedError", "Permission denied"), webview)).toBe("inApp");
    expect(micProblem(error("NotFoundError"), safari)).toBe("noMic");
    expect(micProblem(error("NotReadableError"), chrome)).toBe("busy");
  });

  it("covers browsers that can't record at all", () => {
    expect(micProblem(new TypeError("undefined is not an object"), safari)).toBe("unsupported");
    expect(micProblem(undefined, instagram)).toBe("inApp");
  });
});
