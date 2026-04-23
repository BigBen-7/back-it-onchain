/**
 * rpc-retry.util.ts
 *
 * Framework-agnostic exponential-backoff retry engine for Soroban RPC calls.
 * Used directly by the RetryableService helper and the @Retryable() decorator.
 *
 * Backoff schedule (default, base 1 s, factor 2, jitter ±20 %):
 *   Attempt 1 → immediate
 *   Attempt 2 → ~1 000 ms
 *   Attempt 3 → ~2 000 ms
 *   Attempt 4 → ~4 000 ms
 *   Attempt 5 → throws RpcExhaustedError
 */

import { Logger } from '@nestjs/common';

// ─── Error types ────────────────────────────────────────────────────────────

/** Thrown when every retry attempt has been exhausted. */
export class RpcExhaustedError extends Error {
  constructor(
    public readonly operation: string,
    public readonly attempts: number,
    public readonly lastError: Error,
  ) {
    super(
      `RPC operation "${operation}" failed after ${attempts} attempt(s): ${lastError.message}`,
    );
    this.name = 'RpcExhaustedError';
  }
}

/** Thrown by a predicate to signal that retrying is futile (e.g. 4xx logic error). */
export class RpcNonRetryableError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = 'RpcNonRetryableError';
  }
}

// ─── Configuration ──────────────────────────────────────────────────────────

export interface RetryOptions {
  /**
   * Maximum number of *total* attempts (including the first call).
   * @default 4
   */
  maxAttempts?: number;

  /**
   * Base delay in milliseconds. Each retry waits `baseDelayMs * (factor ^ attempt)`.
   * @default 1000
   */
  baseDelayMs?: number;

  /**
   * Exponential growth factor.
   * @default 2
   */
  factor?: number;

  /**
   * Maximum delay cap in milliseconds — prevents runaway waits on high attempt counts.
   * @default 30_000
   */
  maxDelayMs?: number;

  /**
   * Fractional jitter applied to each delay to avoid thundering-herd on multiple callers.
   * 0.2 means ±20% of the computed delay.
   * @default 0.2
   */
  jitter?: number;

  /**
   * Optional predicate — return `false` to skip retrying for a specific error
   * (e.g. a 400 Bad Request is a logic error, not a transient network issue).
   */
  isRetryable?: (err: Error, attempt: number) => boolean;

  /**
   * Label used in log messages — typically the method or operation name.
   */
  operationName?: string;
}

const DEFAULTS = {
  maxAttempts: 4,
  baseDelayMs: 1_000,
  factor: 2,
  maxDelayMs: 30_000,
  jitter: 0.2,
} as const;

// ─── Core implementation ─────────────────────────────────────────────────────

const logger = new Logger('RpcRetry');

/**
 * Executes `fn` with exponential-backoff retry logic.
 *
 * @param fn      Async function to execute. May be called up to `maxAttempts` times.
 * @param options Retry configuration.
 * @returns       The resolved value of `fn` on success.
 * @throws        `RpcExhaustedError` if all attempts fail.
 * @throws        `RpcNonRetryableError` (re-thrown immediately, no more retries).
 *
 * @example
 * const result = await withRetry(
 *   () => sorobanRpc.getContractData(key),
 *   { operationName: 'getContractData', maxAttempts: 5 },
 * );
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxAttempts = DEFAULTS.maxAttempts,
    baseDelayMs = DEFAULTS.baseDelayMs,
    factor = DEFAULTS.factor,
    maxDelayMs = DEFAULTS.maxDelayMs,
    jitter = DEFAULTS.jitter,
    isRetryable,
    operationName = 'rpc',
  } = options;

  let lastError: Error = new Error('Unknown error');

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Non-retryable errors bubble up immediately
      if (lastError instanceof RpcNonRetryableError) throw lastError;

      // Caller-supplied predicate
      if (isRetryable && !isRetryable(lastError, attempt)) {
        throw new RpcNonRetryableError(
          `Non-retryable error on "${operationName}": ${lastError.message}`,
          lastError,
        );
      }

      if (attempt === maxAttempts) break; // don't sleep on the final failure

      const rawDelay = Math.min(
        baseDelayMs * Math.pow(factor, attempt - 1),
        maxDelayMs,
      );
      const jitterMs = rawDelay * jitter * (Math.random() * 2 - 1); // ±jitter%
      const delay = Math.max(0, Math.round(rawDelay + jitterMs));

      logger.warn(
        `[${operationName}] attempt ${attempt}/${maxAttempts} failed — ` +
          `retrying in ${delay}ms. Error: ${lastError.message}`,
      );

      await sleep(delay);
    }
  }

  throw new RpcExhaustedError(operationName, maxAttempts, lastError);
}

/** Convenience: build a pre-configured retry wrapper for a fixed set of options. */
export function createRetryFn(defaults: RetryOptions) {
  return <T>(fn: () => Promise<T>, overrides: RetryOptions = {}): Promise<T> =>
    withRetry(fn, { ...defaults, ...overrides });
}

// ─── RxJS integration ────────────────────────────────────────────────────────

/**
 * Returns an RxJS `RetryConfig` object compatible with `retry({ delay: ... })`.
 * Use this when the Soroban client wraps calls in Observables.
 *
 * @example
 * import { retry } from 'rxjs';
 * sorobanObservable$.pipe(retry(sorobanRetryConfig())).subscribe(...)
 */
export function sorobanRetryConfig(options: RetryOptions = {}) {
  const {
    maxAttempts = DEFAULTS.maxAttempts,
    baseDelayMs = DEFAULTS.baseDelayMs,
    factor = DEFAULTS.factor,
    maxDelayMs = DEFAULTS.maxDelayMs,
    jitter = DEFAULTS.jitter,
    operationName = 'rpc',
  } = options;

  // Imported lazily so this file stays usable in projects without rxjs

  const { timer, throwError } = require('rxjs') as typeof import('rxjs');

  return {
    count: maxAttempts - 1, // rxjs counts retries, not total attempts
    delay: (error: Error, retryIndex: number) => {
      if (error instanceof RpcNonRetryableError) return throwError(() => error);

      const rawDelay = Math.min(
        baseDelayMs * Math.pow(factor, retryIndex - 1),
        maxDelayMs,
      );
      const jitterMs = rawDelay * jitter * (Math.random() * 2 - 1);
      const delay = Math.max(0, Math.round(rawDelay + jitterMs));

      logger.warn(
        `[${operationName}] RxJS retry ${retryIndex}/${maxAttempts - 1} — ` +
          `waiting ${delay}ms. Error: ${error.message}`,
      );

      return timer(delay);
    },
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Default retryability predicate for Soroban RPC errors.
 * Treats 4xx responses (except 429 Too Many Requests) as non-retryable.
 */
export function defaultSorobanIsRetryable(err: Error): boolean {
  const msg = err.message.toLowerCase();

  // Rate-limit (429) → always retry
  if (
    msg.includes('429') ||
    msg.includes('rate limit') ||
    msg.includes('too many requests')
  ) {
    return true;
  }

  // Other 4xx client errors → logic/auth errors, no point retrying
  if (
    /\b4[0-9]{2}\b/.test(msg) &&
    !msg.includes('408') &&
    !msg.includes('425')
  ) {
    return false;
  }

  // Network / 5xx / timeout → retryable
  return true;
}
