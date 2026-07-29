import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { timingSafeEqual } from 'node:crypto';

@Injectable()
export class AdminIngestionKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>('ADMIN_INGESTION_KEY');

    if (!expected || expected === 'replace-with-a-long-random-value') {
      throw new ServiceUnavailableException(
        'Corpus administration is disabled until ADMIN_INGESTION_KEY is configured.',
      );
    }

    const request = context.switchToHttp().getRequest<Request>();
    const provided = request.header('x-admin-ingestion-key');

    if (!provided || !this.matches(provided, expected)) {
      throw new UnauthorizedException('Invalid corpus administration key.');
    }

    return true;
  }

  private matches(provided: string, expected: string): boolean {
    const providedBuffer = Buffer.from(provided);
    const expectedBuffer = Buffer.from(expected);

    return (
      providedBuffer.length === expectedBuffer.length &&
      timingSafeEqual(providedBuffer, expectedBuffer)
    );
  }
}
