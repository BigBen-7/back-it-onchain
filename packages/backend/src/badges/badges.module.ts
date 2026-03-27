import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserBadge } from './badge.entity';
import { BadgesService } from './badges.service';
import { BadgesListener } from './badges.listener';

@Module({
  imports: [TypeOrmModule.forFeature([UserBadge])],
  providers: [BadgesService, BadgesListener],
  exports: [BadgesService],
})
export class BadgesModule {}
