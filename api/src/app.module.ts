import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthModule } from './health/health.module';
import { CorpusModule } from './corpus/corpus.module';
import { TutorModule } from './tutor/tutor.module';
import { VoiceModule } from './voice/voice.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: ['.env', '../.env'],
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const databaseUrl = config.get<string>('DATABASE_URL');

        if (!databaseUrl) {
          throw new Error(
            'DATABASE_URL is required. Copy .env.example to .env before starting the API.',
          );
        }

        return {
          type: 'postgres' as const,
          url: databaseUrl,
          ssl:
            config.get<string>('DATABASE_SSL', 'false') === 'true'
              ? { rejectUnauthorized: false }
              : false,
          autoLoadEntities: true,
          synchronize: false,
          retryAttempts: 3,
          retryDelay: 1_000,
        };
      },
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
          password: config.get<string>('REDIS_PASSWORD') || undefined,
        },
        prefix: config.get<string>('QUEUE_PREFIX', 'stem-ai-tutor'),
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2_000,
          },
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      }),
    }),
    HealthModule,
    CorpusModule,
    TutorModule,
    VoiceModule,
  ],
})
export class AppModule {}
