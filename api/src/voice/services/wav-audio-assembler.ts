import { SpeechProviderError } from '../providers/speech-provider.error';

interface ParsedWav {
  format: Buffer;
  data: Buffer;
}

export function assemblePcmWav(parts: readonly Buffer[]): Buffer {
  if (parts.length === 0) {
    throw new SpeechProviderError('SPEECH_PROVIDER_EMPTY_RESPONSE', true);
  }
  if (parts.length === 1) return parts[0];

  const parsed = parts.map(parsePcmWav);
  const expectedFormat = parsed[0].format;
  if (parsed.some((part) => !part.format.equals(expectedFormat))) {
    throw new SpeechProviderError('SPEECH_PROVIDER_INVALID_AUDIO', false);
  }

  const audioData = Buffer.concat(parsed.map((part) => part.data));
  const formatPadding = expectedFormat.length % 2;
  const dataPadding = audioData.length % 2;
  const riffSize =
    4 +
    8 +
    expectedFormat.length +
    formatPadding +
    8 +
    audioData.length +
    dataPadding;
  const output = Buffer.alloc(8 + riffSize);
  output.write('RIFF', 0, 'ascii');
  output.writeUInt32LE(riffSize, 4);
  output.write('WAVE', 8, 'ascii');
  output.write('fmt ', 12, 'ascii');
  output.writeUInt32LE(expectedFormat.length, 16);
  expectedFormat.copy(output, 20);
  let offset = 20 + expectedFormat.length + formatPadding;
  output.write('data', offset, 'ascii');
  output.writeUInt32LE(audioData.length, offset + 4);
  offset += 8;
  audioData.copy(output, offset);
  return output;
}

function parsePcmWav(audio: Buffer): ParsedWav {
  if (
    audio.length < 12 ||
    audio.subarray(0, 4).toString('ascii') !== 'RIFF' ||
    audio.subarray(8, 12).toString('ascii') !== 'WAVE'
  ) {
    throw new SpeechProviderError('SPEECH_PROVIDER_INVALID_AUDIO', false);
  }

  let format: Buffer | null = null;
  const dataParts: Buffer[] = [];
  let offset = 12;
  while (offset + 8 <= audio.length) {
    const id = audio.subarray(offset, offset + 4).toString('ascii');
    const size = audio.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + size;
    if (end > audio.length) {
      throw new SpeechProviderError('SPEECH_PROVIDER_INVALID_AUDIO', false);
    }
    if (id === 'fmt ') format = audio.subarray(start, end);
    if (id === 'data') dataParts.push(audio.subarray(start, end));
    offset = end + (size % 2);
  }
  if (!format || format.length < 16 || dataParts.length === 0) {
    throw new SpeechProviderError('SPEECH_PROVIDER_INVALID_AUDIO', false);
  }
  const audioFormat = format.readUInt16LE(0);
  if (audioFormat !== 1 && audioFormat !== 3) {
    throw new SpeechProviderError('SPEECH_PROVIDER_INVALID_AUDIO', false);
  }
  return { format, data: Buffer.concat(dataParts) };
}
