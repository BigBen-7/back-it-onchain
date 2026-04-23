/**
 * EXAMPLE: Integrating Notifications with Users Service
 *
 * This file shows how to update your users.service.ts to emit notifications
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationEventsService } from '../notifications/notification-events.service';

// Example method to add to your UsersService

// @Injectable()
// export class UsersService {
//   constructor(
//     @InjectRepository(User)
//     private usersRepository: Repository<User>,
//     @InjectRepository(UserFollows)
//     private userFollowsRepository: Repository<UserFollows>,
//     private notificationEventsService: NotificationEventsService,
//   ) {}

//   /**
//    * Override the existing follow method to add notifications
//    */
//   async follow(
//     followerWallet: string,
//     followingWallet: string
//   ): Promise<void> {
//     if (followerWallet === followingWallet) {
//       throw new ConflictException('Cannot follow yourself');
//     }

//     const existing = await this.userFollowsRepository.findOne({
//       where: { followerWallet, followingWallet },
//     });

//     if (existing) {
//       return; // Already following
//     }

//     const follow = this.userFollowsRepository.create({
//       followerWallet,
//       followingWallet,
//     });
//     await this.userFollowsRepository.save(follow);

//     // NEW: Notify the user being followed
//     const follower = await this.usersRepository.findOne({
//       where: { wallet: followerWallet },
//     });

//     await this.notificationEventsService.notifyNewFollower(
//       followerWallet,
//       follower?.handle,
//       follower?.avatarCid,
//       followingWallet
//     );
//   }
// }

export const USERS_SERVICE_NOTIFICATION_EXAMPLE = true;
