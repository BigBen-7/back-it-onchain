import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { BadgesService } from './badges.service';
import {
  MarketResolvedEvent,
  NewFollowerEvent,
  StakeReceivedEvent,
} from '../notifications/notification-events.service';

/** Emitted by IndexerService whenever a new on-chain call is recorded. */
export interface CallCreatedEvent {
  callId: string;
  creatorWallet: string;
}

@Injectable()
export class BadgesListener {
  constructor(private readonly badgesService: BadgesService) {}

  /** New call created — check FIRST_CALL */
  @OnEvent('call.created', { async: true })
  async onCallCreated(event: CallCreatedEvent): Promise<void> {
    await this.badgesService.checkAndGrantBadges(event.creatorWallet);
  }

  /** Market resolved — check FIVE_WINS, TEN_WINS */
  @OnEvent('market.resolved', { async: true })
  async onMarketResolved(event: MarketResolvedEvent): Promise<void> {
    await this.badgesService.checkAndGrantBadges(event.creatorWallet);
  }

  /** Stake received on a call — check WHALE_STAKER for the call creator */
  @OnEvent('stake.received', { async: true })
  async onStakeReceived(event: StakeReceivedEvent): Promise<void> {
    await this.badgesService.checkAndGrantBadges(event.creatorWallet);
  }

  /** New follower — check SOCIAL_BUTTERFLY for the followed user */
  @OnEvent('follower.new', { async: true })
  async onNewFollower(event: NewFollowerEvent): Promise<void> {
    await this.badgesService.checkAndGrantBadges(event.followedWallet);
  }
}
