import { Injectable } from '@nestjs/common';
import { SpeechResult, TtsChunkMetrics } from '../contracts/voice.contracts';
import { VoicePolicyService } from '../policies/voice-policy.service';

export interface CachedSpeechChunk {
  result: SpeechResult;
  metrics: TtsChunkMetrics;
}

interface CacheEntry {
  fingerprint: string;
  chunks: Map<number, CachedSpeechChunk>;
  byteCount: number;
  touchedAt: number;
}

@Injectable()
export class SpeechChunkCacheService {
  private readonly entries = new Map<string, CacheEntry>();
  private totalBytes = 0;

  constructor(private readonly policy: VoicePolicyService) {}

  get(
    voiceSessionId: string,
    fingerprint: string,
    chunkIndex: number,
  ): CachedSpeechChunk | null {
    this.prune();
    const entry = this.entries.get(voiceSessionId);
    if (!entry || entry.fingerprint !== fingerprint) return null;
    entry.touchedAt = Date.now();
    const cached = entry.chunks.get(chunkIndex);
    if (!cached) return null;
    return {
      result: { ...cached.result, audio: cached.result.audio },
      metrics: { ...cached.metrics, cached: true },
    };
  }

  set(
    voiceSessionId: string,
    fingerprint: string,
    chunkIndex: number,
    chunk: CachedSpeechChunk,
  ): void {
    this.prune();
    let entry = this.entries.get(voiceSessionId);
    if (entry && entry.fingerprint !== fingerprint) {
      this.remove(voiceSessionId);
      entry = undefined;
    }
    if (!entry) {
      entry = {
        fingerprint,
        chunks: new Map(),
        byteCount: 0,
        touchedAt: Date.now(),
      };
      this.entries.set(voiceSessionId, entry);
    }
    const previous = entry.chunks.get(chunkIndex);
    if (previous) {
      entry.byteCount -= previous.result.audio.length;
      this.totalBytes -= previous.result.audio.length;
    }
    entry.chunks.set(chunkIndex, chunk);
    entry.byteCount += chunk.result.audio.length;
    entry.touchedAt = Date.now();
    this.totalBytes += chunk.result.audio.length;
    this.evictToLimit();
  }

  private prune(): void {
    const expiry = Date.now() - this.policy.ttsChunkCacheTtlMs;
    for (const [sessionId, entry] of this.entries) {
      if (entry.touchedAt < expiry) this.remove(sessionId);
    }
  }

  private evictToLimit(): void {
    while (this.totalBytes > this.policy.ttsChunkCacheMaxBytes) {
      const oldest = [...this.entries.entries()].sort(
        ([, left], [, right]) => left.touchedAt - right.touchedAt,
      )[0];
      if (!oldest) return;
      this.remove(oldest[0]);
    }
  }

  private remove(sessionId: string): void {
    const entry = this.entries.get(sessionId);
    if (!entry) return;
    this.totalBytes -= entry.byteCount;
    this.entries.delete(sessionId);
  }
}
