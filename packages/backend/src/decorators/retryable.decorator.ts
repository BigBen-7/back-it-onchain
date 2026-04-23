/**
 * retryable.decorator.ts
 *
 * Method decorator that wraps any async class method with exponential-backoff
 * retry logic. Works on NestJS service methods or any plain TypeScript class.
 *
 * Usage:
 *
 * @Retryable(3)
 * async fetchEvents() { ... }
 *
 * @Retryable({ maxAttempts: 5, baseDelayMs: 500, operationName: 'fetchOraclePrice' })
 * async getOraclePrice() { ... }
 */

import {
  withRetry,
  RetryOptions,
  defaultSorobanIsRetryable,
} from '../common/rpc/rpc-retry.util';

/**
 * @Retryable(maxAttempts)
 * @Retryable(options)
 *
 * Decorates an async method to automatically retry on failure using
 * exponential backoff with jitter.
 *
 * The `operationName` defaults to `ClassName.methodName` if not provided.
 *
 * @example
 * // Simple — 3 total attempts, all other defaults
 * @Retryable(3)
 * async fetchContractState(key: string): Promise<string> {
 *   return this.sorobanRpc.getContractData(key);
 * }
 *
 * @example
 * // Full config — custom backoff, non-retryable predicate
 * @Retryable({
 *   maxAttempts: 5,
 *   baseDelayMs: 500,
 *   isRetryable: defaultSorobanIsRetryable,
 *   operationName: 'oracle:getPrice',
 * })
 * async getPrice(asset: string): Promise<number> {
 *   return this.rpcClient.simulateTransaction(...);
 * }
 */
export function Retryable(optionsOrMaxAttempts: number | RetryOptions) {
  const options: RetryOptions =
    typeof optionsOrMaxAttempts === 'number'
      ? {
          maxAttempts: optionsOrMaxAttempts,
          isRetryable: defaultSorobanIsRetryable,
        }
      : {
          isRetryable: defaultSorobanIsRetryable,
          ...optionsOrMaxAttempts,
        };

  return function (
    target: object,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor {
    const originalMethod = descriptor.value as (
      ...args: unknown[]
    ) => Promise<unknown>;

    // Build a human-readable operation name for log messages
    const className = target.constructor?.name ?? 'Unknown';
    const operationName =
      options.operationName ?? `${className}.${propertyKey}`;

    descriptor.value = async function (...args: unknown[]) {
      return withRetry(() => originalMethod.apply(this, args), {
        ...options,
        operationName,
      });
    };

    // Preserve the method name for stack traces and Reflect metadata
    Object.defineProperty(descriptor.value, 'name', { value: propertyKey });

    return descriptor;
  };
}
