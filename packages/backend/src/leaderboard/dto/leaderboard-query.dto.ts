import { IsEnum, IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { LeaderboardPeriod } from '../entities/leaderboard.entity';

export class LeaderboardQueryDto {
  @IsEnum(LeaderboardPeriod)
  period: LeaderboardPeriod;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
