import { APICallError, RetryError } from "ai";

const BUSY_STATUS = new Set([429, 500, 502, 503, 504]);

/**
 * True when the AI service failed for a temporary reason on its side (overloaded,
 * rate-limited, down), as opposed to a bad request. Worth trying again later or
 * with another model.
 */
export function isAiBusy(err: unknown): boolean {
  if (RetryError.isInstance(err)) return isAiBusy(err.lastError);
  if (APICallError.isInstance(err)) return err.statusCode !== undefined && BUSY_STATUS.has(err.statusCode);
  return false;
}

/**
 * Runs an AI call; if it (and the backup model) are busy, waits a moment and tries once
 * more. For background work, where a short wait costs nobody anything.
 */
export async function retryIfBusy<T>(call: () => Promise<T>, pauseMs = 20_000): Promise<T> {
  try {
    return await call();
  } catch (err) {
    if (!isAiBusy(err)) throw err;
    await new Promise((resolve) => setTimeout(resolve, pauseMs));
    return call();
  }
}
