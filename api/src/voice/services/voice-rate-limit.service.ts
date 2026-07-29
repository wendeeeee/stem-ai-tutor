import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

interface Bucket {
  count: number;
  resetAt: number;
}

@Injectable()
export class VoiceRateLimitService {
  private readonly buckets = new Map<string, Bucket>();

  assert(key: string, limit: number, windowMs = 60_000): void {
    const now = Date.now();
    const current = this.buckets.get(key);
    if (!current || current.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      return;
    }
    if (current.count >= limit) {
      throw new HttpException(
        'Too many voice requests. Please wait before trying again.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    current.count += 1;
  }
}
