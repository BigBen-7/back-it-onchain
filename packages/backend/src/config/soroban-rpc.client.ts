/**
 * soroban-rpc.client.ts
 *
 * Thin wrapper around the Stellar SDK's SorobanRpc module that:
 *  1. Centralises all outbound Soroban RPC calls in one place.
 *  2. Applies @Retryable() with Soroban-appropriate defaults to every method.
 *  3. Exposes a clean interface so IndexerService and OracleService never
 *     touch the raw SDK client directly.
 *
 * Install deps:
 *   npm install @stellar/stellar-sdk
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  rpc,
  Contract,
  xdr,
  scValToNative,
  Address,
} from '@stellar/stellar-sdk';
import { Retryable } from '../decorators/retryable.decorator';
import {
  defaultSorobanIsRetryable,
  RpcExhaustedError,
} from '../common/rpc/rpc-retry.util';

export interface SorobanEvent {
  id: string;
  type: string;
  ledger: number;
  ledgerClosedAt: string;
  contractId: string;
  topic: unknown[];
  value: unknown;
}

export interface ContractDataResult {
  key: string;
  value: unknown;
  lastModifiedLedger: number;
}

@Injectable()
export class SorobanRpcClient implements OnModuleInit {
  private readonly logger = new Logger(SorobanRpcClient.name);
  private rpc: rpc.Server;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const rpcUrl = this.config.get<string>(
      'SOROBAN_RPC_URL',
      'https://soroban-testnet.stellar.org',
    );
    this.rpc = new rpc.Server(rpcUrl, {
      allowHttp: rpcUrl.startsWith('http://'),
    });
    this.logger.log(`Soroban RPC client initialised → ${rpcUrl}`);
  }

  // ─── Health / connectivity ──────────────────────────────────────────────

  @Retryable({ maxAttempts: 3, operationName: 'soroban:getHealth' })
  async getHealth(): Promise<rpc.Api.GetHealthResponse> {
    return this.rpc.getHealth();
  }

  @Retryable({ maxAttempts: 3, operationName: 'soroban:getLatestLedger' })
  async getLatestLedger(): Promise<rpc.Api.GetLatestLedgerResponse> {
    return this.rpc.getLatestLedger();
  }

  // ─── Contract data reads ─────────────────────────────────────────────────

  /**
   * Reads a single persistent contract data entry by XDR key.
   * Used by OracleService to read on-chain oracle prices and quorum config.
   */
  @Retryable({
    maxAttempts: 4,
    baseDelayMs: 1_000,
    isRetryable: defaultSorobanIsRetryable,
    operationName: 'soroban:getContractData',
  })
  async getContractData(
    contractId: string,
    key: xdr.ScVal,
    durability: rpc.Durability = rpc.Durability.Persistent,
  ): Promise<ContractDataResult | null> {
    try {
      const response = await this.rpc.getContractData(
        contractId,
        key,
        durability,
      );

      if (!response?.val) return null;

      return {
        key: key.toXDR('base64'),
        value: scValToNative(response.val.contractData().val()),
        lastModifiedLedger: response.lastModifiedLedgerSeq || 0,
      };
    } catch (err) {
      // "entry not found" is not a network error — don't retry
      if ((err as Error).message?.includes('not found')) return null;
      throw err;
    }
  }

  // ─── Event fetching ──────────────────────────────────────────────────────

  /**
   * Fetches contract events in a ledger range.
   * Used by IndexerService to ingest stake / market events.
   */
  @Retryable({
    maxAttempts: 5,
    baseDelayMs: 1_000,
    isRetryable: defaultSorobanIsRetryable,
    operationName: 'soroban:getEvents',
  })
  async getEvents(params: {
    startLedger: number;
    contractIds: string[];
    eventTypes?: ('contract' | 'system' | 'diagnostic')[];
    limit?: number;
  }): Promise<SorobanEvent[]> {
    const {
      startLedger,
      contractIds,
      eventTypes = ['contract'],
      limit = 200,
    } = params;

    const filters: rpc.Api.EventFilter[] = contractIds.map((id) => ({
      type: eventTypes[0] as rpc.Api.EventFilter['type'],
      contractIds: [id],
    }));

    const response = await this.rpc.getEvents({
      startLedger,
      filters,
      limit,
    });

    return (response.events ?? []).map((e) => ({
      id: e.id,
      type: e.type,
      ledger: e.ledger,
      ledgerClosedAt: e.ledgerClosedAt,
      contractId: e.contractId?.toString() ?? '',
      topic: e.topic.map(scValToNative),
      value: scValToNative(e.value),
    }));
  }

  // ─── Transaction submission ──────────────────────────────────────────────

  /**
   * Simulates a transaction (read-only) and returns the result.
   * OracleService uses this to invoke view functions on CallRegistry.
   */
  @Retryable({
    maxAttempts: 4,
    baseDelayMs: 1_000,
    isRetryable: defaultSorobanIsRetryable,
    operationName: 'soroban:simulateTransaction',
  })
  async simulateTransaction(
    transaction: Parameters<rpc.Server['simulateTransaction']>[0],
  ): Promise<rpc.Api.SimulateTransactionResponse> {
    return this.rpc.simulateTransaction(transaction);
  }

  /**
   * Submits a signed transaction and polls for its result.
   * OutcomeManager calls this for manual resolution transactions.
   */
  @Retryable({
    maxAttempts: 4,
    baseDelayMs: 2_000,
    isRetryable: defaultSorobanIsRetryable,
    operationName: 'soroban:sendTransaction',
  })
  async sendTransaction(
    transaction: Parameters<rpc.Server['sendTransaction']>[0],
  ): Promise<rpc.Api.SendTransactionResponse> {
    return this.rpc.sendTransaction(transaction);
  }

  /**
   * Polls transaction status until it is final (SUCCESS / FAILED / timeout).
   * Retried separately from send because a successful send may still need polling.
   */
  @Retryable({
    maxAttempts: 10,
    baseDelayMs: 2_000,
    factor: 1.5,
    maxDelayMs: 15_000,
    operationName: 'soroban:getTransaction',
  })
  async getTransaction(hash: string): Promise<rpc.Api.GetTransactionResponse> {
    const result = await this.rpc.getTransaction(hash);
    // NOT_FOUND means still pending — treat as retriable
    if (result.status === rpc.Api.GetTransactionStatus.NOT_FOUND) {
      throw new Error(`Transaction ${hash} still pending (NOT_FOUND)`);
    }
    return result;
  }

  // ─── Convenience: send and wait ──────────────────────────────────────────

  /**
   * Submits a transaction and polls until a terminal status is reached.
   * Combines sendTransaction + getTransaction into a single awaitable call.
   */
  async sendAndConfirm(
    transaction: Parameters<rpc.Server['sendTransaction']>[0],
    timeoutMs = 60_000,
  ): Promise<rpc.Api.GetTransactionResponse> {
    const sendResult = await this.sendTransaction(transaction);

    if (sendResult.status === 'ERROR') {
      throw new RpcExhaustedError(
        'soroban:sendTransaction',
        1,
        new Error(`Send failed: ${JSON.stringify(sendResult.errorResult)}`),
      );
    }

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        return await this.getTransaction(sendResult.hash);
      } catch {
        // still pending — getTransaction retry handles the wait
      }
    }

    throw new Error(
      `Transaction ${sendResult.hash} did not confirm within ${timeoutMs}ms`,
    );
  }
}
