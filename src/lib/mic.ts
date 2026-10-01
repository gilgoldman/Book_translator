// Why the browser wouldn't give us the microphone, so we can say what to do about it. Browsers
// only ask "Allow microphone?" when nothing has decided already: a site blocked earlier, a
// device-wide setting, or an app's built-in browser all refuse at once, without asking.

export type MicProblem =
  /** Blocked for this site: they said no once, or dismissed the question a few times. */
  | "blocked"
  /** The phone or computer doesn't let this browser use the microphone at all. */
  | "system"
  /** Inside another app (WhatsApp, Instagram, Gmail…), whose browser won't share it. */
  | "inApp"
  | "noMic"
  /** Another app (a call, a recorder) has it. */
  | "busy"
  /** No recording here at all: an old browser, or a page not on https. */
  | "unsupported";

/** An app's built-in browser rather than Chrome, Safari or Firefox themselves. */
export function isInAppBrowser(userAgent: string): boolean {
  return /FBAN|FBAV|Instagram|WhatsApp|Line\/|Telegram|GSA\/|LinkedInApp|Snapchat|; wv\)/i.test(userAgent);
}

/** What getUserMedia's error (or its absence) means for them. */
export function micProblem(err: unknown, userAgent: string): MicProblem {
  const { name = "", message = "" } = (err ?? {}) as { name?: string; message?: string };
  const inApp = isInAppBrowser(userAgent);
  if (name === "NotFoundError" || name === "OverconstrainedError") return "noMic";
  if (name === "NotReadableError" || name === "AbortError") return "busy";
  if (name === "NotAllowedError" || name === "SecurityError") {
    if (inApp) return "inApp";
    // Chrome says "Permission denied by system" when the device settings block it.
    return /system/i.test(message) ? "system" : "blocked";
  }
  return inApp ? "inApp" : "unsupported";
}
