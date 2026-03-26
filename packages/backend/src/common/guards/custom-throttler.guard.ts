import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  protected generateKey(context: ExecutionContext, trackerString: string, throttlerName: string): string {
    const req = context.switchToHttp().getRequest();
    const tracker = req.user?.id || req.user?.wallet || req.headers['x-user-wallet'] || req.ip;
    return `${throttlerName}:${tracker}`;
  }

  // Fallback for older throttler versions
  protected getTracker(req: Record<string, any>): string {
    return req.user?.id || req.user?.wallet || req.headers['x-user-wallet'] || req.ip;
  }
}
