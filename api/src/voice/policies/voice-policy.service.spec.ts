import { ConfigService } from '@nestjs/config';
import { VoicePolicyService } from './voice-policy.service';

describe('VoicePolicyService speech-provider settings', () => {
  it('selects 9jaLingo by default with language-specific voices', () => {
    const policy = new VoicePolicyService(new ConfigService());

    expect(policy.ttsProvider).toBe('naijalingo');
    expect(policy.selectedTtsMaxInputCharacters).toBe(8_000);
    expect(policy.selectedTtsModel).toBe('9jalingo-tts-1');
    expect(policy.selectedTtsVoiceFor('pcm')).toBe('ada_pcm');
    expect(policy.selectedTtsVoiceFor('ig')).toBe('adaeze_ig');
    expect(policy.selectedTtsVoiceFor('yo')).toBe('adeola_yo');
    expect(policy.selectedTtsVoiceFor('ha')).toBe('aisha_ha');
    expect(policy.selectedTtsFormat).toBe('wav');
    expect(policy.ttsChunkMinimumCharacters).toBe(400);
    expect(policy.ttsChunkPreferredCharacters).toBe(550);
    expect(policy.ttsChunkMaximumCharacters).toBe(700);
    expect(policy.ttsChunkMaxRetries).toBe(2);
    expect(policy.ttsApplicationTimeoutMs).toBe(65_000);
  });

  it('keeps ElevenLabs explicitly selectable and applies the canonical 8,000-character ceiling', () => {
    const policy = new VoicePolicyService(
      new ConfigService({
        TTS_PROVIDER: 'elevenlabs',
        ELEVEN_LABS_MAX_INPUT_CHARACTERS: 40_000,
        ELEVEN_LABS_VOICE_ID: 'voice-id',
        ELEVEN_LABS_VOICE_NAME: 'Ada Tutor',
      }),
    );

    expect(policy.ttsProvider).toBe('elevenlabs');
    expect(policy.selectedTtsMaxInputCharacters).toBe(8_000);
    expect(policy.selectedTtsModel).toBe('eleven_flash_v2_5');
    expect(policy.selectedTtsVoice).toBe('Ada Tutor');
    expect(policy.selectedTtsVoiceId).toBe('voice-id');
    expect(policy.selectedTtsFormat).toBe('mp3_44100_128');
    expect(policy.elevenLabsCostPerThousandCharacters).toBe(0.05);
    expect(policy.elevenLabsPricingEffectiveDate).toBe('2026-07-24');
  });

  it('uses the lower configured or documented ElevenLabs model limit', () => {
    const configured = new VoicePolicyService(
      new ConfigService({
        ELEVEN_LABS_MAX_INPUT_CHARACTERS: 7_000,
      }),
    );
    expect(configured.elevenLabsMaxInputCharacters).toBe(7_000);

    const documented = new VoicePolicyService(
      new ConfigService({
        ELEVEN_LABS_MODEL_ID: 'eleven_v3',
        ELEVEN_LABS_MAX_INPUT_CHARACTERS: 40_000,
      }),
    );
    expect(documented.elevenLabsMaxInputCharacters).toBe(5_000);
  });

  it('enforces the documented 2,000-character ceiling', () => {
    const policy = new VoicePolicyService(
      new ConfigService({
        TTS_PROVIDER: 'yarngpt',
        YARN_GPT_MAX_INPUT_CHARACTERS: 3_000,
      }),
    );

    expect(policy.yarnGptMaxInputCharacters).toBe(2_000);
    expect(policy.selectedTtsMaxInputCharacters).toBe(2_000);
    expect(policy.selectedTtsVoice).toBe('Chinenye');
    expect(policy.selectedTtsFormat).toBe('mp3');
  });

  it('keeps OpenAI as an explicit selectable fallback', () => {
    const policy = new VoicePolicyService(
      new ConfigService({
        TTS_PROVIDER: 'openai',
        TTS_MAX_INPUT_CHARACTERS: 4_096,
        TTS_VOICE: 'cedar',
      }),
    );

    expect(policy.ttsProvider).toBe('openai');
    expect(policy.selectedTtsMaxInputCharacters).toBe(4_096);
    expect(policy.selectedTtsVoice).toBe('cedar');
  });

  it('rejects unsupported provider names and YarnGPT formats', () => {
    expect(
      () =>
        new VoicePolicyService(
          new ConfigService({ TTS_PROVIDER: 'automatic' }),
        ),
    ).toThrow(
      'TTS_PROVIDER must be one of naijalingo, elevenlabs, yarngpt, or openai.',
    );
    expect(
      () =>
        new VoicePolicyService(
          new ConfigService({ YARN_GPT_RESPONSE_FORMAT: 'aac' }),
        ),
    ).toThrow('YARN_GPT_RESPONSE_FORMAT must be one of');
  });

  it('rejects unsupported ElevenLabs formats and invalid logging flags', () => {
    expect(
      () =>
        new VoicePolicyService(
          new ConfigService({ ELEVEN_LABS_OUTPUT_FORMAT: 'json' }),
        ),
    ).toThrow('ELEVEN_LABS_OUTPUT_FORMAT must be one of');
    expect(
      () =>
        new VoicePolicyService(
          new ConfigService({ ELEVEN_LABS_ENABLE_LOGGING: 'sometimes' }),
        ),
    ).toThrow('ELEVEN_LABS_ENABLE_LOGGING must be true or false.');
  });

  it('rejects inconsistent chunk limits', () => {
    expect(
      () =>
        new VoicePolicyService(
          new ConfigService({
            TTS_CHUNK_MIN_CHARACTERS: 600,
            TTS_CHUNK_PREFERRED_CHARACTERS: 500,
          }),
        ),
    ).toThrow('TTS chunk sizes must satisfy minimum <= preferred <= maximum.');
  });
});
