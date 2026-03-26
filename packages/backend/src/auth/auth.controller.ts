import { Controller, Post, Body } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { ChainType } from '../users/user.entity';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Throttle({ short: { limit: 5, ttl: 60000 } })
  @Post('login')
  async login(
    @Body() body: { wallet: string; chain?: ChainType; referrerWallet?: string },
  ) {
    const user = await this.authService.validateUser(
      body.wallet,
      body.chain,
      body.referrerWallet,
    );
    return user;
  }
}
