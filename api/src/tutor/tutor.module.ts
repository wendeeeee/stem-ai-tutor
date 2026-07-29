import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CorpusModule } from '../corpus/corpus.module';
import { DeterministicRetrievalAgent } from './agents/deterministic-retrieval.agent';
import { ModelGroundingVerifierAgent } from './agents/model-grounding-verifier.agent';
import { ModelQueryTransformerAgent } from './agents/model-query-transformer.agent';
import { ModelTutorAgent } from './agents/model-tutor.agent';
import { AgentEvent } from './entities/agent-event.entity';
import { ToolInvocation } from './entities/tool-invocation.entity';
import { TutorRun } from './entities/tutor-run.entity';
import { TypeOrmTutorRunStore } from './persistence/typeorm-tutor-run.store';
import { HarnessPolicyService } from './policies/harness-policy.service';
import { OpenAiGroundingVerifierProvider } from './providers/openai-grounding-verifier.provider';
import { OpenAiModelResponseClient } from './providers/openai-model-response.client';
import { OpenAiTutorProvider } from './providers/openai-tutor.provider';
import { OpenAiQueryTransformerProvider } from './query-transformer/openai-query-transformer.provider';
import { TutorOrchestratorService } from './services/tutor-orchestrator.service';
import { TutorRunQueryService } from './services/tutor-run-query.service';
import { CurriculumSearchTool } from './tools/curriculum-search.tool';
import { ToolRegistryService } from './tools/tool-registry.service';
import { TutorController } from './tutor.controller';
import { VoiceSession } from '../voice/entities/voice-session.entity';
import { VoiceModule } from '../voice/voice.module';
import { OpenAiReinforcementEvaluationProvider } from './reinforcement/openai-reinforcement-evaluation.provider';
import { OpenAiReinforcementQuestionProvider } from './reinforcement/openai-reinforcement-question.provider';
import { ReinforcementAttempt } from './reinforcement/reinforcement-attempt.entity';
import { ReinforcementPolicyService } from './reinforcement/reinforcement-policy.service';
import { ReinforcementQuestionSet } from './reinforcement/reinforcement-question-set.entity';
import { ReinforcementService } from './reinforcement/reinforcement.service';
import {
  GROUNDING_VERIFIER_AGENT,
  GROUNDING_VERIFIER_PROVIDER,
  MODEL_RESPONSE_CLIENT,
  QUERY_TRANSFORMER_AGENT,
  QUERY_TRANSFORMER_PROVIDER,
  RETRIEVAL_AGENT,
  REINFORCEMENT_EVALUATION_PROVIDER,
  REINFORCEMENT_QUESTION_PROVIDER,
  TUTOR_AGENT,
  TUTOR_PROVIDER,
  TUTOR_RUN_STORE,
  TRANSLATION_PROVIDER,
} from './tutor.constants';
import { GeminiTranslationProvider } from './translation/gemini-translation.provider';

@Module({
  imports: [
    CorpusModule,
    VoiceModule,
    TypeOrmModule.forFeature([
      TutorRun,
      AgentEvent,
      ToolInvocation,
      VoiceSession,
      ReinforcementQuestionSet,
      ReinforcementAttempt,
    ]),
  ],
  controllers: [TutorController],
  providers: [
    HarnessPolicyService,
    TypeOrmTutorRunStore,
    CurriculumSearchTool,
    ToolRegistryService,
    TutorOrchestratorService,
    TutorRunQueryService,
    OpenAiQueryTransformerProvider,
    ModelQueryTransformerAgent,
    DeterministicRetrievalAgent,
    OpenAiModelResponseClient,
    OpenAiTutorProvider,
    OpenAiGroundingVerifierProvider,
    ModelTutorAgent,
    ModelGroundingVerifierAgent,
    ReinforcementPolicyService,
    ReinforcementService,
    OpenAiReinforcementQuestionProvider,
    OpenAiReinforcementEvaluationProvider,
    GeminiTranslationProvider,
    { provide: TUTOR_RUN_STORE, useExisting: TypeOrmTutorRunStore },
    {
      provide: QUERY_TRANSFORMER_PROVIDER,
      useExisting: OpenAiQueryTransformerProvider,
    },
    {
      provide: QUERY_TRANSFORMER_AGENT,
      useExisting: ModelQueryTransformerAgent,
    },
    { provide: RETRIEVAL_AGENT, useExisting: DeterministicRetrievalAgent },
    {
      provide: MODEL_RESPONSE_CLIENT,
      useExisting: OpenAiModelResponseClient,
    },
    { provide: TUTOR_PROVIDER, useExisting: OpenAiTutorProvider },
    {
      provide: GROUNDING_VERIFIER_PROVIDER,
      useExisting: OpenAiGroundingVerifierProvider,
    },
    {
      provide: REINFORCEMENT_QUESTION_PROVIDER,
      useExisting: OpenAiReinforcementQuestionProvider,
    },
    {
      provide: REINFORCEMENT_EVALUATION_PROVIDER,
      useExisting: OpenAiReinforcementEvaluationProvider,
    },
    {
      provide: TRANSLATION_PROVIDER,
      useExisting: GeminiTranslationProvider,
    },
    { provide: TUTOR_AGENT, useExisting: ModelTutorAgent },
    {
      provide: GROUNDING_VERIFIER_AGENT,
      useExisting: ModelGroundingVerifierAgent,
    },
  ],
  exports: [TutorOrchestratorService, TutorRunQueryService],
})
export class TutorModule {}
