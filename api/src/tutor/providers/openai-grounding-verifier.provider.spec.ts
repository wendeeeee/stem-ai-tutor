import { ConfigService } from '@nestjs/config';
import { CurriculumChunk } from '../contracts/tutor-run-state';
import {
  ModelResponseClient,
  ModelResponseRequest,
  ModelResponseResult,
} from './model-response-client';
import { OpenAiGroundingVerifierProvider } from './openai-grounding-verifier.provider';
import { describe, expect, it, jest } from '@jest/globals';
const chunk = {
  chunkId: 'chunk-1',
  content: 'A physical change does not produce a new substance.',
  topic: { id: null, label: 'Physical changes' },
  locator: { pageStart: 4, pageEnd: 4, sourceLocator: 'page 4' },
  document: {
    id: 'document-1',
    sourceTitle: 'Basic Science Text',
    sourceAuthor: null,
    sourcePublisher: null,
    sourceUrl: null,
    sourceLicence: 'CC BY 4.0',
    subject: 'Basic Science',
    schoolLevel: 'SS1',
    curriculum: 'NERDC',
  },
  similarity: 0.9,
  semanticSimilarity: 0.9,
  lexicalSimilarity: 0.8,
  hybridScore: 0.9,
  matchedBy: ['semantic'] as const,
  accepted: true,
} satisfies CurriculumChunk;

class FakeClient implements ModelResponseClient {
  request: ModelResponseRequest | null = null;

  constructor(
    private readonly result: ModelResponseResult,
    private readonly configured = true,
  ) {}

  isConfigured(): boolean {
    return this.configured;
  }

  create(request: ModelResponseRequest): Promise<ModelResponseResult> {
    this.request = request;
    return Promise.resolve(this.result);
  }
}

function config(): ConfigService {
  return {
    get: jest.fn((_key: string, fallback: unknown) => fallback),
  } as unknown as ConfigService;
}

function response(output: unknown): ModelResponseResult {
  return {
    outputText: typeof output === 'string' ? output : JSON.stringify(output),
    model: 'gpt-5.6-terra',
    status: 'completed',
    refused: false,
    inputTokens: 80,
    outputTokens: 20,
  };
}

describe('OpenAiGroundingVerifierProvider', () => {
  const input = {
    question: 'What is a physical change?',
    answer: 'A physical change does not produce a new substance.',
    citations: [
      {
        chunkId: chunk.chunkId,
        sourceTitle: chunk.document.sourceTitle,
        sourceLocator: chunk.locator.sourceLocator,
      },
    ],
    chunks: [chunk],
    attempt: 'initial' as const,
    revisionAvailable: true,
    deadlineAt: new Date(Date.now() + 1_000),
  };

  it('approves a fully checked grounded answer and maps usage', async () => {
    const client = new FakeClient(
      response({
        grounded: true,
        reasons: ['Every material claim is supported by the cited chunk.'],
        checkedCitationIds: ['chunk-1'],
        revisionRecommended: false,
        revisionGuidance: null,
        unsupportedClaims: [],
      }),
    );
    const provider = new OpenAiGroundingVerifierProvider(config(), client);

    const result = await provider.verify(input, new AbortController().signal);

    expect(result).toMatchObject({
      grounded: true,
      inputTokens: 80,
      outputTokens: 20,
      estimatedCostUsd: 0.0005,
    });
    expect(client.request?.instructions).toContain(
      'independent evidence checker',
    );
    expect(client.request?.instructions).toContain(
      'brief non-factual empathy, encouragement',
    );
    expect(client.request?.instructions).toContain(
      'Reject invented personal details',
    );
    expect(client.request?.input).toContain('<UNTRUSTED_DRAFT_ANSWER>');
    expect(client.request?.input).toContain(
      '<UNTRUSTED_RETRIEVED_CURRICULUM_EVIDENCE>',
    );
  });

  it('returns unsupported claims and actionable first-attempt guidance', async () => {
    const provider = new OpenAiGroundingVerifierProvider(
      config(),
      new FakeClient(
        response({
          grounded: false,
          reasons: ['The answer adds a boiling-point claim not in the chunk.'],
          checkedCitationIds: ['chunk-1'],
          revisionRecommended: true,
          revisionGuidance: 'Remove the unsupported boiling-point claim.',
          unsupportedClaims: ['Water boils at 100 degrees Celsius.'],
        }),
      ),
    );

    await expect(
      provider.verify(input, new AbortController().signal),
    ).resolves.toMatchObject({
      grounded: false,
      revisionRecommended: true,
      unsupportedClaims: ['Water boils at 100 degrees Celsius.'],
    });
  });

  it.each([
    ['malformed JSON', response('{bad-json')],
    [
      'unchecked citation',
      response({
        grounded: true,
        reasons: [],
        checkedCitationIds: [],
        revisionRecommended: false,
        revisionGuidance: null,
        unsupportedClaims: [],
      }),
    ],
    [
      'revision recommendation after exhaustion',
      response({
        grounded: false,
        reasons: ['Still unsupported.'],
        checkedCitationIds: ['chunk-1'],
        revisionRecommended: true,
        revisionGuidance: 'Try again.',
        unsupportedClaims: ['Unsupported claim.'],
      }),
    ],
  ])('fails closed on %s output', async (label, providerResponse) => {
    const provider = new OpenAiGroundingVerifierProvider(
      config(),
      new FakeClient(providerResponse),
    );
    const request =
      label === 'revision recommendation after exhaustion'
        ? { ...input, attempt: 'revision' as const, revisionAvailable: false }
        : input;

    await expect(
      provider.verify(request, new AbortController().signal),
    ).rejects.toMatchObject({
      code: 'INVALID_GROUNDING_VERIFIER_OUTPUT',
    });
  });

  it('fails safely without a configured API client', async () => {
    const provider = new OpenAiGroundingVerifierProvider(
      config(),
      new FakeClient(response(''), false),
    );

    await expect(
      provider.verify(input, new AbortController().signal),
    ).rejects.toMatchObject({
      code: 'GROUNDING_VERIFIER_NOT_CONFIGURED',
    });
  });
});
