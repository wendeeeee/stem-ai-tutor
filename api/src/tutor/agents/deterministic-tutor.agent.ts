import { Injectable } from '@nestjs/common';
import { AgentResult, TutorAgent } from '../contracts/agent.contract';
import {
  TutorAgentInput,
  TutorAgentOutput,
} from '../contracts/workflow.contracts';

@Injectable()
export class DeterministicTutorAgent implements TutorAgent<
  TutorAgentInput,
  TutorAgentOutput
> {
  readonly name = 'tutor';

  execute(input: TutorAgentInput): Promise<AgentResult<TutorAgentOutput>> {
    const evidence = input.chunks[0];
    if (!evidence) {
      return Promise.resolve({
        output: {
          answer: 'The retrieved curriculum evidence is insufficient.',
          citations: [],
          answerSummary: 'Insufficient curriculum evidence.',
          insufficientEvidence: true,
          limitation: 'No retrieved curriculum chunk can support an answer.',
        },
        usage: {
          tokens: { input: 0, output: 0, total: 0 },
          estimatedCostUsd: 0,
        },
        summary: { evidenceCount: 0 },
      });
    }

    const prefix = input.revision
      ? 'Revised curriculum-grounded explanation:'
      : 'According to the curriculum:';
    const answer = `${prefix} ${this.firstUsefulExcerpt(evidence.content)}`;
    const inputTokens = Math.max(
      1,
      Math.ceil(
        (input.question.length +
          input.chunks.reduce((sum, chunk) => sum + chunk.content.length, 0)) /
          4,
      ),
    );
    const outputTokens = Math.max(1, Math.ceil(answer.length / 4));

    return Promise.resolve({
      output: {
        answer,
        citations: [
          {
            chunkId: evidence.chunkId,
            sourceTitle: evidence.document.sourceTitle,
            sourceLocator: evidence.locator.sourceLocator,
          },
        ],
        answerSummary: 'A curriculum excerpt answers the student question.',
        insufficientEvidence: false,
        limitation: null,
      },
      usage: {
        tokens: {
          input: inputTokens,
          output: outputTokens,
          total: inputTokens + outputTokens,
        },
        estimatedCostUsd: 0,
      },
      summary: {
        citationCount: 1,
        revision: Boolean(input.revision),
      },
    });
  }

  private firstUsefulExcerpt(content: string): string {
    const normalized = content.replace(/\s+/g, ' ').trim();
    const sentenceEnd = normalized.search(/[.!?](?:\s|$)/);
    const excerpt =
      sentenceEnd >= 0 ? normalized.slice(0, sentenceEnd + 1) : normalized;
    return excerpt.slice(0, 700);
  }
}
