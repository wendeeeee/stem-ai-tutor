import { ConfigService } from '@nestjs/config';
import { HarnessPolicyService, RunBudget } from './harness-policy.service';
import { describe, expect, it, jest } from '@jest/globals';

describe('HarnessPolicyService', () => {
  const defaultConfig = {
    get: jest.fn((_key: string, fallback: unknown) => fallback),
  } as unknown as ConfigService;

  it('allows the bounded revision path to use more than the former 16000-token ceiling', () => {
    const policy = new HarnessPolicyService(defaultConfig);
    const budget = new RunBudget(policy.values, Date.now());

    expect(policy.values.maxTokens).toBe(32_000);
    expect(() =>
      budget.addUsage(
        { input: 15_917, output: 1_701, total: 17_618 },
        0.0645976,
        'verification',
      ),
    ).not.toThrow();
  });

  it('continues to fail closed above the configured token ceiling', () => {
    const policy = new HarnessPolicyService(defaultConfig);
    const budget = new RunBudget(policy.values, Date.now());

    expect(() =>
      budget.addUsage(
        { input: 31_000, output: 1_001, total: 32_001 },
        0,
        'verification',
      ),
    ).toThrow('The tutor reached its token budget.');
  });

  it('does not terminate a bounded workflow because of total wall-clock duration', () => {
    const policy = new HarnessPolicyService(defaultConfig);
    const budget = new RunBudget(policy.values, Date.now() - 60_000);

    expect(() => budget.beforeAgent('verification')).not.toThrow();
  });
});
