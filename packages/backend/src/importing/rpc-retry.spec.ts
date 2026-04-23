/**
 * rpc-retry.spec.ts
 *
 * Unit tests for the exponential-backoff retry engine.
 * Run with: npx jest rpc-retry --testPathPattern src/common
 */

import {
  withRetry,
  RpcExhaustedError,
  RpcNonRetryableError,
  defaultSorobanIsRetryable,
} from '../common/rpc/rpc-retry.util';
import { Retryable } from '../decorators/retryable.decorator';

// ── Suppress logger noise in tests ──────────────────────────────────────────
jest.mock('@nestjs/common', () => {
  const actual =
    jest.requireActual<typeof import('@nestjs/common')>('@nestjs/common');
  return {
    ...actual,
    Logger: class {
      warn = jest.fn();
      error = jest.fn();
      log = jest.fn();
      debug = jest.fn();
    },
  };
});

// Speed up tests — override sleep
jest.useFakeTimers();

async function drainPromises() {
  // Flush microtasks then advance all pending timers repeatedly
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
    jest.runAllTimers();
    await Promise.resolve();
  }
}

// ─── withRetry ───────────────────────────────────────────────────────────────

describe('withRetry', () => {
  it('resolves immediately when fn succeeds on first attempt', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    const promise = withRetry(fn, { maxAttempts: 3 });
    await drainPromises();
    await expect(promise).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries and eventually succeeds', async () => {
    let calls = 0;
    const fn = jest.fn().mockImplementation(() => {
      calls++;
      if (calls < 3) return Promise.reject(new Error('transient'));
      return Promise.resolve('recovered');
    });

    const promise = withRetry(fn, { maxAttempts: 4, baseDelayMs: 100 });
    await drainPromises();
    await expect(promise).resolves.toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws RpcExhaustedError when all attempts fail', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('rpc down'));
    const promise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 100 });
    await drainPromises();

    await expect(promise).rejects.toThrow(RpcExhaustedError);
    await expect(promise).rejects.toMatchObject({ attempts: 3 });
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry when RpcNonRetryableError is thrown', async () => {
    const fn = jest
      .fn()
      .mockRejectedValue(new RpcNonRetryableError('bad request'));

    const promise = withRetry(fn, { maxAttempts: 4 });
    await drainPromises();

    await expect(promise).rejects.toThrow(RpcNonRetryableError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('respects isRetryable predicate', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('HTTP 400 bad request'));
    const promise = withRetry(fn, {
      maxAttempts: 4,
      isRetryable: defaultSorobanIsRetryable,
    });
    await drainPromises();

    // 400 is non-retryable — should throw immediately without 3 more attempts
    await expect(promise).rejects.toThrow(RpcNonRetryableError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('allows 429 rate-limit errors to be retried', async () => {
    let calls = 0;
    const fn = jest.fn().mockImplementation(() => {
      calls++;
      if (calls < 3)
        return Promise.reject(new Error('HTTP 429 rate limit exceeded'));
      return Promise.resolve('after rate limit');
    });

    const promise = withRetry(fn, {
      maxAttempts: 4,
      baseDelayMs: 100,
      isRetryable: defaultSorobanIsRetryable,
    });
    await drainPromises();

    await expect(promise).resolves.toBe('after rate limit');
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

// ─── @Retryable decorator ────────────────────────────────────────────────────

describe('@Retryable decorator', () => {
  class FakeRpcService {
    calls = 0;

    @Retryable(3)
    async callWithRetry(): Promise<string> {
      this.calls++;
      if (this.calls < 3) throw new Error('transient rpc error');
      return 'success';
    }

    @Retryable({ maxAttempts: 2, baseDelayMs: 50 })
    async alwaysFails(): Promise<never> {
      throw new Error('permanently broken');
    }
  }

  it('retries the method and returns result on success', async () => {
    const svc = new FakeRpcService();
    const promise = svc.callWithRetry();
    await drainPromises();
    await expect(promise).resolves.toBe('success');
    expect(svc.calls).toBe(3);
  });

  it('throws RpcExhaustedError after maxAttempts', async () => {
    const svc = new FakeRpcService();
    const promise = svc.alwaysFails();
    await drainPromises();
    await expect(promise).rejects.toThrow(RpcExhaustedError);
  });
});

// ─── defaultSorobanIsRetryable ───────────────────────────────────────────────

describe('defaultSorobanIsRetryable', () => {
  it.each([
    ['network timeout', true],
    ['ECONNREFUSED', true],
    ['HTTP 500 Internal Server Error', true],
    ['HTTP 503 service unavailable', true],
    ['429 Too Many Requests', true],
    ['HTTP 400 bad request', false],
    ['HTTP 401 unauthorized', false],
    ['HTTP 403 forbidden', false],
    ['HTTP 404 not found', false],
  ])('"%s" → retryable=%s', (message, expected) => {
    expect(defaultSorobanIsRetryable(new Error(message))).toBe(expected);
  });
});
