import { Module, Global } from '@nestjs/common';
import { SorobanRpcClient } from './soroban-rpc.client';

/**
 * RpcModule
 *
 * Marked @Global so that SorobanRpcClient is available for injection in
 * IndexerModule, OracleModule, and any future module without re-importing.
 *
 * Add to AppModule.imports once.
 */
@Global()
@Module({
  providers: [SorobanRpcClient],
  exports: [SorobanRpcClient],
})
export class RpcModule {}
