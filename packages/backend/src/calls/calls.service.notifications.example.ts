/**
 * EXAMPLE: Integrating Notifications with Calls Service
 *
 * This file shows how to update your calls.service.ts to emit notifications
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationEventsService } from '../notifications/notification-events.service';

// Example method to add to your CallsService

// @Injectable()
// export class CallsService {
//   constructor(
//     @InjectRepository(Call)
//     private callsRepository: Repository<Call>,
//     private notificationEventsService: NotificationEventsService,
//   ) {}

//   /**
//    * Resolve a market and notify all participants
//    */
//   async resolveMarket(
//     callId: number,
//     outcome: 'yes' | 'no'
//   ): Promise<void> {
//     // Get the call
//     const call = await this.callsRepository.findOne({
//       where: { id: callId },
//       relations: ['creator'],
//     });

//     if (!call) {
//       throw new Error(`Call with ID ${callId} not found`);
//     }

//     // Get all stakers for this call
//     // NOTE: You need to implement a Stake entity/repository to query this
//     const stakers = await this.stakesRepository.find({
//       where: { callId },
//     });

//     // Update call status to resolved
//     call.resolved = true;
//     call.outcome = outcome;
//     await this.callsRepository.save(call);

//     // Notify all participants
//     await this.notificationEventsService.notifyMarketResolved(
//       callId,
//       call.title, // Make sure your Call entity has a 'title' field
//       outcome,
//       call.creatorWallet,
//       stakers.map((stake) => ({
//         wallet: stake.userWallet,
//         amount: stake.amount.toString(),
//         choice: stake.position ? 'yes' : 'no', // Assuming boolean position
//       }))
//     );
//   }

//   /**
//    * Called when someone stakes on a call
//    * This should be called from your oracle/indexer when a stake is detected on-chain
//    */
//   async handleStakeReceived(
//     callId: number,
//     staker: string,
//     amount: string,
//     choice: 'yes' | 'no'
//   ): Promise<void> {
//     const call = await this.callsRepository.findOne({
//       where: { id: callId },
//     });

//     if (!call) {
//       throw new Error(`Call with ID ${callId} not found`);
//     }

//     // Notify the call creator that someone staked
//     await this.notificationEventsService.notifyStakeReceived(
//       callId,
//       call.title,
//       staker,
//       amount,
//       choice,
//       call.creatorWallet
//     );
//   }
// }

export const CALLS_SERVICE_NOTIFICATION_EXAMPLE = true;
