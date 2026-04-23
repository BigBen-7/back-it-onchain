import { IsString, IsNotEmpty } from 'class-validator';

export class SubscribeMarketDto {
  @IsString()
  @IsNotEmpty()
  marketId!: string;
}

export class UnsubscribeMarketDto {
  @IsString()
  @IsNotEmpty()
  marketId!: string;
}
