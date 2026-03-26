import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export enum PriceHistoryPeriod {
  SEVEN_DAYS = '7d',
  THIRTY_DAYS = '30d',
}

export class PriceHistoryQueryDto {
  @IsString()
  @IsNotEmpty()
  tokenAddress: string;

  @IsOptional()
  @IsEnum(PriceHistoryPeriod)
  period?: PriceHistoryPeriod;
}
