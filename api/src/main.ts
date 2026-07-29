import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const port = config.get<number>('PORT', 3000);

  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  const allowedOrigins = config
    .get<string>('WEB_ORIGINS', 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    allowedHeaders: ['content-type'],
    exposedHeaders: [
      'x-voice-session-id',
      'x-tts-provider',
      'x-tts-api-version',
      'x-tts-model',
      'x-tts-voice',
      'x-tts-voice-id',
      'x-tts-format',
      'x-tts-latency-ms',
      'x-tts-input-characters',
      'x-tts-chunk-count',
      'x-tts-estimated-cost-usd',
      'x-tts-estimated-cost',
      'x-tts-cost-status',
      'x-tts-pricing-currency',
      'x-tts-pricing-version',
      'x-tts-pricing-effective-date',
      'x-tts-pricing-rate-per-1000-characters',
      'x-tts-provider-character-cost',
      'x-tts-output-bytes',
    ],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  await app.listen(port);
}

void bootstrap();
