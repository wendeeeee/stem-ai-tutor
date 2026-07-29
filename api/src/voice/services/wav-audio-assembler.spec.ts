import { assemblePcmWav } from './wav-audio-assembler';

function pcmWav(data: Buffer, sampleRate = 16_000): Buffer {
  const output = Buffer.alloc(44 + data.length + (data.length % 2));
  output.write('RIFF', 0, 'ascii');
  output.writeUInt32LE(output.length - 8, 4);
  output.write('WAVE', 8, 'ascii');
  output.write('fmt ', 12, 'ascii');
  output.writeUInt32LE(16, 16);
  output.writeUInt16LE(1, 20);
  output.writeUInt16LE(1, 22);
  output.writeUInt32LE(sampleRate, 24);
  output.writeUInt32LE(sampleRate * 2, 28);
  output.writeUInt16LE(2, 32);
  output.writeUInt16LE(16, 34);
  output.write('data', 36, 'ascii');
  output.writeUInt32LE(data.length, 40);
  data.copy(output, 44);
  return output;
}

describe('assemblePcmWav', () => {
  it('rebuilds one valid WAV with audio payloads in order', () => {
    const combined = assemblePcmWav([
      pcmWav(Buffer.from([1, 2])),
      pcmWav(Buffer.from([3, 4])),
      pcmWav(Buffer.from([5, 6])),
    ]);

    expect(combined.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(combined.subarray(8, 12).toString('ascii')).toBe('WAVE');
    expect(combined.readUInt32LE(40)).toBe(6);
    expect(combined.subarray(44, 50)).toEqual(Buffer.from([1, 2, 3, 4, 5, 6]));
    expect(combined.readUInt32LE(4)).toBe(combined.length - 8);
  });

  it('rejects incompatible WAV formats', () => {
    expect(() =>
      assemblePcmWav([
        pcmWav(Buffer.from([1, 2]), 16_000),
        pcmWav(Buffer.from([3, 4]), 24_000),
      ]),
    ).toThrow('SPEECH_PROVIDER_INVALID_AUDIO');
  });
});
