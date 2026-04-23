import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EventsGateway } from './events.gateway';
import { WsJwtGuard } from './guards/ws-jwt.guard';

@Module({
  imports: [AuthModule],
  providers: [EventsGateway, WsJwtGuard],
  exports: [EventsGateway],
})
export class GatewaysModule {}
