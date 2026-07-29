import { ConfigService } from '@nestjs/config';
import { VoicePolicyService } from './policies/voice-policy.service';
import { ElevenLabsSpeechProvider } from './providers/elevenlabs-speech.provider';
import { OpenAiSpeechProvider } from './providers/openai-speech.provider';
import { YarnGptSpeechProvider } from './providers/yarngpt-speech.provider';
import { selectSpeechProvider } from './voice.module';
import { NaijaLingoSpeechProvider } from './providers/naijalingo-speech.provider';

describe('selectSpeechProvider', () => {
  const providers = {
    naijaLingo: {} as NaijaLingoSpeechProvider,
    elevenLabs: {} as ElevenLabsSpeechProvider,
    yarnGpt: {} as YarnGptSpeechProvider,
    openAi: {} as OpenAiSpeechProvider,
  };

  it.each([
    ['naijalingo', 'naijaLingo'],
    ['elevenlabs', 'elevenLabs'],
    ['yarngpt', 'yarnGpt'],
    ['openai', 'openAi'],
  ] as const)('selects only the explicit %s provider', (name, expected) => {
    const policy = new VoicePolicyService(
      new ConfigService({ TTS_PROVIDER: name }),
    );

    expect(
      selectSpeechProvider(
        policy,
        providers.naijaLingo,
        providers.elevenLabs,
        providers.yarnGpt,
        providers.openAi,
      ),
    ).toBe(providers[expected]);
  });
});
