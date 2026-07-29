import { config } from 'dotenv';
import { resolve } from 'node:path';
import { DataSource } from 'typeorm';
import { CorpusChunk } from '../corpus/entities/corpus-chunk.entity';
import { CorpusDocument } from '../corpus/entities/corpus-document.entity';
import { CorpusSource } from '../corpus/entities/corpus-source.entity';
import { CurriculumTopic } from '../corpus/entities/curriculum-topic.entity';
import { IngestionRun } from '../corpus/entities/ingestion-run.entity';
import { AgentEvent } from '../tutor/entities/agent-event.entity';
import { ToolInvocation } from '../tutor/entities/tool-invocation.entity';
import { TutorRun } from '../tutor/entities/tutor-run.entity';
import { VoiceSession } from '../voice/entities/voice-session.entity';
import { ReinforcementAttempt } from '../tutor/reinforcement/reinforcement-attempt.entity';
import { ReinforcementQuestionSet } from '../tutor/reinforcement/reinforcement-question-set.entity';

config({
  path: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../.env')],
});

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL is required. Copy .env.example to .env before running migrations.',
  );
}

export default new DataSource({
  type: 'postgres',
  url: databaseUrl,
  ssl:
    process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  entities: [
    CorpusSource,
    CorpusDocument,
    CurriculumTopic,
    CorpusChunk,
    IngestionRun,
    TutorRun,
    AgentEvent,
    ToolInvocation,
    VoiceSession,
    ReinforcementQuestionSet,
    ReinforcementAttempt,
  ],
  migrations: [resolve(__dirname, 'migrations/*{.ts,.js}')],
  synchronize: false,
});
