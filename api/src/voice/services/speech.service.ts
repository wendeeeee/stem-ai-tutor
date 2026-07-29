import {
  BadGatewayException,
  ConflictException,
  GatewayTimeoutException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'node:crypto';
import { TutorRun } from '../../tutor/entities/tutor-run.entity';
import {
  SpeechProvider,
  SpeechResult,
  TtsChunkMetrics,
  TtsMetrics,
} from '../contracts/voice.contracts';
import { VoicePolicyService } from '../policies/voice-policy.service';
import { SPEECH_PROVIDER } from '../voice.constants';
import { VoiceSessionService } from './voice-session.service';
import { toSpeechText } from './speech-text';
import { SpeechProviderError } from '../providers/speech-provider.error';
import { OutputLanguage } from '../../tutor/translation/translation.contracts';
import { SpeechChunkCacheService } from './speech-chunk-cache.service';
import {
  chunkSpeechText,
  normalizeSpeechPunctuation,
} from './speech-text-chunker';
import { assemblePcmWav } from './wav-audio-assembler';

export interface SpeechResponse extends SpeechResult {
  voiceId: string | null;
  providerCharacterCost: number | null;
  latencyMs: number;
  estimatedCostUsd: number | null;
  estimatedCost: number | null;
  costStatus: 'estimated' | 'unavailable';
  pricingCurrency: string;
  pricingEffectiveDate: string | null;
  pricingVersion: string;
  pricingRatePerThousandCharacters: number | null;
  characterCount: number;
  outputByteCount: number;
  chunkCount: number;
  voiceSessionId: string;
}

class ChunkSynthesisFailure extends Error {
  constructor(
    readonly causeError: unknown,
    readonly metrics: TtsChunkMetrics,
  ) {
    super('SPEECH_CHUNK_FAILED');
  }
}

@Injectable()
export class SpeechService {
  constructor(
    @InjectRepository(TutorRun)
    private readonly runs: Repository<TutorRun>,
    @Inject(SPEECH_PROVIDER)
    private readonly provider: SpeechProvider,
    private readonly policy: VoicePolicyService,
    private readonly sessions: VoiceSessionService,
    private readonly chunkCache: SpeechChunkCacheService,
  ) {}

  async synthesize(runId: string): Promise<SpeechResponse> {
    const run = await this.runs.findOne({ where: { id: runId } });
    if (!run) throw new NotFoundException('Tutor run not found.');
    if (
      run.status !== 'completed' ||
      run.refused ||
      !run.finalAnswer ||
      !run.translatedAnswer ||
      !run.grounding?.grounded
    ) {
      throw new ConflictException(
        'Speech is available only for completed, grounded tutor runs.',
      );
    }
    const speechText = normalizeSpeechPunctuation(
      toSpeechText(
        run.translatedAnswer,
        (run.citations ?? []).map((citation) => citation.chunkId),
      ),
    );
    if (!speechText) {
      throw new ConflictException(
        'The completed answer does not contain speakable text.',
      );
    }
    if (speechText.length > this.policy.selectedTtsMaxInputCharacters) {
      await this.ensureVoiceSession(
        run,
        this.failedMetrics(
          speechText.length,
          0,
          'SPEECH_INPUT_TOO_LONG',
          run.outputLanguage,
        ),
      );
      throw new ConflictException(
        'The completed answer is too long for speech synthesis. The written answer is still available.',
      );
    }

    const chunks =
      this.policy.ttsProvider === 'naijalingo'
        ? chunkSpeechText(speechText, {
            minimumCharacters: this.policy.ttsChunkMinimumCharacters,
            preferredCharacters: this.policy.ttsChunkPreferredCharacters,
            maximumCharacters: this.policy.ttsChunkMaximumCharacters,
          })
        : [speechText];
    const initialMetrics = this.failedMetrics(
      speechText.length,
      0,
      null,
      run.outputLanguage,
      chunks.length,
      [],
      null,
    );
    const voiceSessionId = await this.ensureVoiceSession(run, initialMetrics);
    const fingerprint = this.fingerprint(speechText, run.outputLanguage);
    const results: SpeechResult[] = [];
    const chunkMetrics: TtsChunkMetrics[] = [];

    for (let index = 0; index < chunks.length; index += 1) {
      const cached = this.chunkCache.get(voiceSessionId, fingerprint, index);
      if (cached) {
        results.push(cached.result);
        chunkMetrics.push(cached.metrics);
        continue;
      }

      try {
        const generated = await this.synthesizeChunk(
          chunks[index],
          index,
          run.outputLanguage,
        );
        this.assertTotalAudioSize([...results, generated.result]);
        results.push(generated.result);
        chunkMetrics.push(generated.metrics);
        this.chunkCache.set(voiceSessionId, fingerprint, index, generated);
        await this.sessions.saveTts(
          voiceSessionId,
          this.metricsFor(
            speechText.length,
            chunks.length,
            chunkMetrics,
            results,
            false,
            null,
            null,
            run.outputLanguage,
          ),
        );
      } catch (error: unknown) {
        const failure =
          error instanceof ChunkSynthesisFailure
            ? error
            : new ChunkSynthesisFailure(error, {
                index,
                characterCount: chunks[index].length,
                latencyMs: 0,
                retryCount: 0,
                outputByteCount: 0,
                success: false,
                failureCode: this.failureCode(error),
                cached: false,
              });
        chunkMetrics.push(failure.metrics);
        const failureCode =
          failure.metrics.failureCode ?? 'SPEECH_PROVIDER_ERROR';
        await this.sessions.saveTts(
          voiceSessionId,
          this.metricsFor(
            speechText.length,
            chunks.length,
            chunkMetrics,
            results,
            false,
            failureCode,
            index,
            run.outputLanguage,
          ),
        );
        this.throwHttpFailure(failureCode);
      }
    }

    let audio: Buffer;
    try {
      audio = assemblePcmWav(results.map((result) => result.audio));
      if (audio.length > this.policy.ttsMaxTotalAudioBytes) {
        throw new SpeechProviderError(
          'SPEECH_PROVIDER_RESPONSE_TOO_LARGE',
          false,
        );
      }
    } catch (error: unknown) {
      const failureCode = this.failureCode(error);
      await this.sessions.saveTts(
        voiceSessionId,
        this.metricsFor(
          speechText.length,
          chunks.length,
          chunkMetrics,
          results,
          false,
          failureCode,
          null,
          run.outputLanguage,
        ),
      );
      this.throwHttpFailure(failureCode);
    }

    const result = results[0];
    const providerCharacterCost = this.totalProviderCharacterCost(results);
    const metrics = this.metricsFor(
      speechText.length,
      chunks.length,
      chunkMetrics,
      results,
      true,
      null,
      null,
      run.outputLanguage,
      audio.length,
      providerCharacterCost,
    );
    await this.sessions.saveTts(voiceSessionId, metrics);
    return {
      ...result,
      audio,
      voiceId: result.voiceId ?? null,
      providerCharacterCost,
      latencyMs: metrics.totalSynthesisLatencyMs,
      estimatedCostUsd: metrics.estimatedCostUsd,
      estimatedCost: metrics.estimatedCost,
      costStatus: metrics.costStatus,
      pricingCurrency: metrics.pricingCurrency,
      pricingEffectiveDate: metrics.pricingEffectiveDate,
      pricingVersion: metrics.pricingVersion,
      pricingRatePerThousandCharacters:
        metrics.pricingRatePerThousandCharacters,
      characterCount: speechText.length,
      outputByteCount: audio.length,
      chunkCount: chunks.length,
      voiceSessionId,
    };
  }

  private async ensureVoiceSession(
    run: TutorRun,
    metrics: TtsMetrics,
  ): Promise<string> {
    if (run.voiceSessionId) {
      await this.sessions.saveTts(run.voiceSessionId, metrics);
      return run.voiceSessionId;
    }
    const session = await this.sessions.createForTextRun(
      run.outputLanguage,
      metrics,
    );
    await this.runs.update(run.id, { voiceSessionId: session.id });
    run.voiceSessionId = session.id;
    return session.id;
  }

  private failedMetrics(
    characterCount: number,
    latencyMs: number,
    failureCode: string | null,
    language: OutputLanguage = 'pcm',
    chunkCount = 0,
    chunks: TtsChunkMetrics[] = [],
    failedChunkIndex: number | null = null,
  ): TtsMetrics {
    const pricing = this.pricing(this.policy.ttsProvider, characterCount, null);
    return {
      provider: this.policy.ttsProvider,
      apiVersion: 'v1',
      model: this.policy.selectedTtsModel,
      voice: this.policy.selectedTtsVoiceFor(language),
      voiceId: this.policy.selectedTtsVoiceIdFor(language),
      format: this.policy.selectedTtsFormat,
      latencyMs,
      characterCount,
      outputByteCount: 0,
      providerCharacterCost: null,
      estimatedAudioDurationMs: null,
      chunkCount,
      chunks,
      failedChunkIndex,
      totalSynthesisLatencyMs: latencyMs,
      estimatedCostUsd: pricing.estimatedCostUsd,
      estimatedCost: pricing.estimatedCost,
      costStatus: pricing.costStatus,
      pricingCurrency: pricing.pricingCurrency,
      pricingEffectiveDate: pricing.pricingEffectiveDate,
      pricingVersion: pricing.pricingVersion,
      pricingRatePerThousandCharacters:
        pricing.pricingRatePerThousandCharacters,
      success: false,
      failureCode,
    };
  }

  private async synthesizeChunk(
    text: string,
    index: number,
    language: OutputLanguage,
  ): Promise<{ result: SpeechResult; metrics: TtsChunkMetrics }> {
    const startedAt = Date.now();
    let retryCount = 0;
    while (true) {
      try {
        const result = await this.callProviderWithTimeout(text, language);
        if (result.audio.length === 0) {
          throw new SpeechProviderError('SPEECH_PROVIDER_EMPTY_RESPONSE', true);
        }
        return {
          result,
          metrics: {
            index,
            characterCount: text.length,
            latencyMs: Date.now() - startedAt,
            retryCount,
            outputByteCount: result.audio.length,
            success: true,
            failureCode: null,
            cached: false,
          },
        };
      } catch (error: unknown) {
        if (
          this.isRetryable(error) &&
          retryCount < this.policy.ttsChunkMaxRetries
        ) {
          const delayMs =
            this.policy.ttsChunkRetryBaseDelayMs * 2 ** retryCount;
          retryCount += 1;
          await this.delay(delayMs);
          continue;
        }
        throw new ChunkSynthesisFailure(error, {
          index,
          characterCount: text.length,
          latencyMs: Date.now() - startedAt,
          retryCount,
          outputByteCount: 0,
          success: false,
          failureCode: this.failureCode(error),
          cached: false,
        });
      }
    }
  }

  private async callProviderWithTimeout(
    text: string,
    language: OutputLanguage,
  ): Promise<SpeechResult> {
    const controller = new AbortController();
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        this.provider.synthesize({
          text,
          language,
          signal: controller.signal,
        }),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new SpeechProviderError('SPEECH_APPLICATION_TIMEOUT', true));
          }, this.policy.ttsApplicationTimeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private metricsFor(
    characterCount: number,
    chunkCount: number,
    chunks: readonly TtsChunkMetrics[],
    results: readonly SpeechResult[],
    success: boolean,
    failureCode: string | null,
    failedChunkIndex: number | null,
    language: OutputLanguage,
    outputByteCount = results.reduce(
      (total, result) => total + result.audio.length,
      0,
    ),
    providerCharacterCost = this.totalProviderCharacterCost(results),
  ): TtsMetrics {
    const first = results[0];
    const provider = first?.provider ?? this.policy.ttsProvider;
    const estimatedAudioDurationMs = success
      ? Math.ceil((characterCount / this.policy.ttsCharactersPerSecond) * 1_000)
      : null;
    const pricing = this.pricing(
      provider,
      characterCount,
      estimatedAudioDurationMs,
    );
    const totalSynthesisLatencyMs = chunks.reduce(
      (total, chunk) => total + chunk.latencyMs,
      0,
    );
    return {
      provider,
      apiVersion: first?.apiVersion ?? 'v1',
      model: first?.model ?? this.policy.selectedTtsModel,
      voice: first?.voice ?? this.policy.selectedTtsVoiceFor(language),
      voiceId:
        first?.voiceId ?? this.policy.selectedTtsVoiceIdFor(language) ?? null,
      format: first?.format ?? this.policy.selectedTtsFormat,
      latencyMs: totalSynthesisLatencyMs,
      totalSynthesisLatencyMs,
      characterCount,
      chunkCount,
      chunks: chunks.map((chunk) => ({ ...chunk })),
      failedChunkIndex,
      outputByteCount,
      providerCharacterCost,
      estimatedAudioDurationMs,
      estimatedCostUsd: pricing.estimatedCostUsd,
      estimatedCost: pricing.estimatedCost,
      costStatus: pricing.costStatus,
      pricingCurrency: pricing.pricingCurrency,
      pricingEffectiveDate: pricing.pricingEffectiveDate,
      pricingVersion: pricing.pricingVersion,
      pricingRatePerThousandCharacters:
        pricing.pricingRatePerThousandCharacters,
      success,
      failureCode,
    };
  }

  private fingerprint(text: string, language: OutputLanguage): string {
    return createHash('sha256')
      .update(
        [
          this.policy.ttsProvider,
          this.policy.selectedTtsModel,
          this.policy.selectedTtsVoiceFor(language),
          this.policy.selectedTtsFormat,
          language,
          text,
        ].join('\u0000'),
      )
      .digest('hex');
  }

  private assertTotalAudioSize(results: readonly SpeechResult[]): void {
    const byteCount = results.reduce(
      (total, result) => total + result.audio.length,
      0,
    );
    if (byteCount > this.policy.ttsMaxTotalAudioBytes) {
      throw new SpeechProviderError(
        'SPEECH_PROVIDER_RESPONSE_TOO_LARGE',
        false,
      );
    }
  }

  private totalProviderCharacterCost(
    results: readonly SpeechResult[],
  ): number | null {
    if (
      results.length === 0 ||
      results.some((result) => result.providerCharacterCost == null)
    ) {
      return null;
    }
    return results.reduce(
      (total, result) => total + (result.providerCharacterCost ?? 0),
      0,
    );
  }

  private isRetryable(error: unknown): boolean {
    return error instanceof SpeechProviderError && error.retryable;
  }

  private async delay(milliseconds: number): Promise<void> {
    if (milliseconds <= 0) return;
    await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
  }

  private throwHttpFailure(failureCode: string): never {
    if (
      failureCode === 'SPEECH_PROVIDER_TIMEOUT' ||
      failureCode === 'SPEECH_PROVIDER_GATEWAY_TIMEOUT' ||
      failureCode === 'SPEECH_APPLICATION_TIMEOUT' ||
      failureCode === 'VOICE_PROVIDER_TIMEOUT'
    ) {
      throw new GatewayTimeoutException(
        'Speech synthesis timed out. The written answer is still available.',
      );
    }
    throw new BadGatewayException(this.failureMessage(failureCode));
  }

  private pricing(
    provider: SpeechResult['provider'],
    characterCount: number,
    estimatedAudioDurationMs: number | null,
  ): Pick<
    TtsMetrics,
    | 'estimatedCostUsd'
    | 'estimatedCost'
    | 'costStatus'
    | 'pricingCurrency'
    | 'pricingEffectiveDate'
    | 'pricingVersion'
    | 'pricingRatePerThousandCharacters'
  > {
    if (provider === 'naijalingo') {
      const rate = this.policy.naijaLingoCostPerThousandCharacters;
      const estimatedCost =
        rate === null ? null : (characterCount / 1_000) * rate;
      return {
        estimatedCostUsd:
          estimatedCost !== null &&
          this.policy.naijaLingoPricingCurrency === 'USD'
            ? estimatedCost
            : null,
        estimatedCost,
        costStatus: rate === null ? 'unavailable' : 'estimated',
        pricingCurrency: this.policy.naijaLingoPricingCurrency,
        pricingEffectiveDate: this.policy.naijaLingoPricingEffectiveDate,
        pricingVersion: this.policy.naijaLingoPricingVersion,
        pricingRatePerThousandCharacters: rate,
      };
    }
    if (provider === 'elevenlabs') {
      const rate = this.policy.elevenLabsCostPerThousandCharacters;
      const estimatedCost =
        rate === null ? null : (characterCount / 1_000) * rate;
      return {
        estimatedCostUsd:
          estimatedCost !== null &&
          this.policy.elevenLabsPricingCurrency === 'USD'
            ? estimatedCost
            : null,
        estimatedCost,
        costStatus: rate === null ? 'unavailable' : 'estimated',
        pricingCurrency: this.policy.elevenLabsPricingCurrency,
        pricingEffectiveDate: this.policy.elevenLabsPricingEffectiveDate,
        pricingVersion: this.policy.elevenLabsPricingVersion,
        pricingRatePerThousandCharacters: rate,
      };
    }
    if (provider === 'yarngpt') {
      const rate = this.policy.yarnGptCostPerThousandCharacters;
      const estimatedCost =
        rate === null ? null : (characterCount / 1_000) * rate;
      return {
        estimatedCostUsd:
          estimatedCost !== null && this.policy.yarnGptPricingCurrency === 'USD'
            ? estimatedCost
            : null,
        estimatedCost,
        costStatus: rate === null ? 'unavailable' : 'estimated',
        pricingCurrency: this.policy.yarnGptPricingCurrency,
        pricingEffectiveDate: this.policy.yarnGptPricingEffectiveDate,
        pricingVersion: this.policy.yarnGptPricingVersion,
        pricingRatePerThousandCharacters: rate,
      };
    }
    const estimatedCost =
      estimatedAudioDurationMs === null
        ? null
        : (estimatedAudioDurationMs / 60_000) * this.policy.ttsCostPerMinuteUsd;
    return {
      estimatedCostUsd: estimatedCost,
      estimatedCost,
      costStatus: estimatedCost === null ? 'unavailable' : 'estimated',
      pricingCurrency: 'USD',
      pricingEffectiveDate: this.policy.pricingVersion,
      pricingVersion: this.policy.pricingVersion,
      pricingRatePerThousandCharacters: null,
    };
  }

  private failureCode(error: unknown): string {
    if (error instanceof SpeechProviderError) return error.code;
    if (
      error instanceof Error &&
      (error.message === 'SPEECH_NOT_CONFIGURED' ||
        error.message === 'SPEECH_APPLICATION_TIMEOUT')
    ) {
      return error.message;
    }
    if (error instanceof Error && error.message === 'VOICE_PROVIDER_TIMEOUT') {
      return 'VOICE_PROVIDER_TIMEOUT';
    }
    if (error instanceof Error && error.message === 'EMPTY_SPEECH_RESULT') {
      return 'SPEECH_PROVIDER_EMPTY_RESPONSE';
    }
    return 'SPEECH_PROVIDER_ERROR';
  }

  private failureMessage(code: string): string {
    switch (code) {
      case 'SPEECH_NOT_CONFIGURED':
        return 'Speech synthesis is not configured. Check NAIJALINGO_API_KEY and restart the API. The written answer is still available.';
      case 'SPEECH_PROVIDER_AUTHENTICATION_FAILED':
        return '9jaLingo rejected the API key. Check NAIJALINGO_API_KEY and its account access. The written answer is still available.';
      case 'SPEECH_PROVIDER_RATE_LIMITED':
        return 'The 9jaLingo request limit has been reached. Please retry later. The written answer is still available.';
      case 'SPEECH_PROVIDER_VALIDATION_FAILED':
        return '9jaLingo rejected the speech request configuration. The written answer is still available.';
      case 'SPEECH_PROVIDER_INFERENCE_REJECTED':
        return 'The 9jaLingo inference service rejected synthesis. Please retry later or check the API account status. The written answer is still available.';
      case 'SPEECH_PROVIDER_NETWORK_ERROR':
      case 'SPEECH_PROVIDER_BAD_GATEWAY':
      case 'SPEECH_PROVIDER_UNAVAILABLE':
      case 'SPEECH_PROVIDER_GATEWAY_TIMEOUT':
      case 'SPEECH_PROVIDER_HTTP_ERROR':
        return 'The 9jaLingo speech service is temporarily unavailable. Please retry later. The written answer is still available.';
      case 'SPEECH_PROVIDER_UNSUPPORTED_CONTENT_TYPE':
      case 'SPEECH_PROVIDER_EMPTY_RESPONSE':
      case 'SPEECH_PROVIDER_INVALID_AUDIO':
      case 'SPEECH_PROVIDER_RESPONSE_TOO_LARGE':
        return '9jaLingo returned an unusable audio response. The written answer is still available.';
      default:
        return 'Speech synthesis is temporarily unavailable. The written answer is still available.';
    }
  }
}
