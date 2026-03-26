import { createChildLogger } from "./logger.js";
import { MAX_RETRIES, RETRY_BASE_DELAY_MS } from "../config/constants.js";

const log = createChildLogger("retry");

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  onRetry?: (attempt: number, error: Error) => void;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { maxRetries = MAX_RETRIES, baseDelayMs = RETRY_BASE_DELAY_MS, onRetry } = options;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt === maxRetries) break;

      const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 500;
      log.warn({ attempt: attempt + 1, maxRetries, delay, error: lastError.message }, "Retrying...");

      onRetry?.(attempt + 1, lastError);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
