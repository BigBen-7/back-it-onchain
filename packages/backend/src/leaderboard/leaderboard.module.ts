import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { Leaderboard } from './entities/leaderboard.entity';
import { LeaderboardController } from './leaderboard.controller';
import { LeaderboardService } from './leaderboard.service';
import { LeaderboardAggregationJob } from './leaderboard-aggregation.job';

@Module({
  imports: [TypeOrmModule.forFeature([Leaderboard]), ScheduleModule.forRoot()],
  controllers: [LeaderboardController],
  providers: [LeaderboardService, LeaderboardAggregationJob],
})
export class LeaderboardModule { }
