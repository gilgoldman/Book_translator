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
