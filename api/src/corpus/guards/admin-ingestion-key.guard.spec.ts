import {
  ExecutionContext,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminIngestionKeyGuard } from './admin-ingestion-key.guard';

function contextWithKey(key?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        header: () => key,
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('AdminIngestionKeyGuard', () => {
  it('accepts a matching key', () => {
    const config = {
      get: jest.fn().mockReturnValue('a-secure-development-key'),
    } as unknown as ConfigService;
    const guard = new AdminIngestionKeyGuard(config);

    expect(guard.canActivate(contextWithKey('a-secure-development-key'))).toBe(
      true,
    );
  });

  it('rejects an invalid key', () => {
    const config = {
      get: jest.fn().mockReturnValue('a-secure-development-key'),
    } as unknown as ConfigService;
    const guard = new AdminIngestionKeyGuard(config);

    expect(() => guard.canActivate(contextWithKey('wrong-key'))).toThrow(
      UnauthorizedException,
    );
  });

  it('disables administration when no real key is configured', () => {
    const config = {
      get: jest.fn().mockReturnValue('replace-with-a-long-random-value'),
    } as unknown as ConfigService;
    const guard = new AdminIngestionKeyGuard(config);

    expect(() => guard.canActivate(contextWithKey('anything'))).toThrow(
      ServiceUnavailableException,
    );
  });
});
