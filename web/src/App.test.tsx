import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import {
  generateReinforcement,
  getTutorRun,
  streamTutorRun,
  submitReinforcementAnswer,
  synthesizeSpeech,
  transcribeAudio,
} from "./api";
import { ReinforcementState, TraceEvent, TutorRun } from "./types";

vi.mock("./api", () => ({
  generateReinforcement: vi.fn(),
  getTutorRun: vi.fn(),
  streamTutorRun: vi.fn(),
  submitReinforcementAnswer: vi.fn(),
  synthesizeSpeech: vi.fn(),
  transcribeAudio: vi.fn(),
}));

const traceEvent = (
  sequence: number,
  type: string,
  stage: string,
  status: TraceEvent["status"],
  summary: Record<string, unknown> = {},
): TraceEvent => ({
  sequence,
  type,
  stage,
  status,
  summary,
  latencyMs: status === "completed" ? 12 : null,
  tokenCount: 0,
  estimatedCostUsd: 0,
  errorCode: null,
  errorMessage: null,
});

const completedRun: TutorRun = {
  runId: "055c79a0-c1db-47f2-9312-a54670b45bef",
  voiceSessionId: null,
  status: "completed",
  question: "What is energy?",
  language: "en",
  outputLanguage: "pcm",
  retrievedChunks: [
    {
      chunkId: "chunk-energy-01",
      content: "Energy is the capacity to do work in a physical system.",
      topic: { id: "topic-1", label: "Energy and work" },
      locator: { pageStart: 12, pageEnd: 12, sourceLocator: "page 12" },
      document: {
        sourceTitle: "Basic Science Text",
        subject: "Basic Science",
        schoolLevel: "SS1",
        curriculum: "NERDC",
      },
      hybridScore: 0.91,
    },
  ],
  finalAnswer: "Energy is the capacity to do work.",
  translatedAnswer: "Energy na di power to do work.",
  translation: {
    provider: "gemini",
    model: "gemini-2.5-flash",
    sourceLanguage: "en",
    targetLanguage: "pcm",
    inputTokens: 10,
    outputTokens: 10,
    estimatedCostUsd: 0,
    inputCharacters: 34,
    outputCharacters: 31,
    latencyMs: 40,
  },
  citations: [
    {
      chunkId: "chunk-energy-01",
      sourceTitle: "Basic Science Text",
      sourceLocator: "page 12",
    },
  ],
  grounding: { grounded: true },
  refusal: { refused: false, reason: null },
  metrics: {
    tokens: { input: 100, output: 20, total: 120 },
    estimatedCostUsd: 0.002,
    latencyMs: 500,
    agentCalls: 4,
    toolCalls: 1,
    retries: 0,
    revisions: 0,
  },
  voiceMetrics: null,
  trace: [
    traceEvent(1, "agent.completed", "retrieval", "completed"),
    traceEvent(2, "agent.completed", "tutor", "completed"),
  ],
  errors: [],
};

const refusedRun: TutorRun = {
  ...completedRun,
  status: "refused",
  retrievedChunks: [],
  finalAnswer: null,
  citations: [],
  grounding: { grounded: false },
  refusal: {
    refused: true,
    reason: "No curriculum evidence met the retrieval threshold.",
  },
};

const reinforcementReady: ReinforcementState = {
  runId: completedRun.runId,
  activeQuestionId: "a6db8472-bfca-4c86-9f12-175c18eb448a",
  complete: false,
  generation: {
    model: "fake-reinforcement",
    inputTokens: 20,
    outputTokens: 10,
    estimatedCostUsd: 0.001,
  },
  questions: [
    {
      id: "a6db8472-bfca-4c86-9f12-175c18eb448a",
      position: 0,
      prompt: "What does energy allow a physical system to do?",
      completed: false,
      exhausted: false,
      attemptsRemaining: 3,
      attempts: [],
    },
  ],
};

async function typeAndConfirm(question = "What is energy?") {
  const user = userEvent.setup();
  await user.type(
    screen.getByLabelText("Editable question transcript"),
    question,
  );
  await user.click(
    screen.getByLabelText(
      "I reviewed this transcript and it asks the question I intend.",
    ),
  );
  return user;
}

function successfulStream(run: TutorRun) {
  vi.mocked(streamTutorRun).mockImplementation(async (_input, onEvent) => {
    await onEvent(
      traceEvent(0, "run.created", "run", "info", { runId: run.runId }),
    );
    await onEvent(traceEvent(1, "agent.started", "retrieval", "started"));
    await onEvent(traceEvent(2, "retrieval.completed", "retrieval", "info"));
    await onEvent(
      traceEvent(
        3,
        run.status === "refused" ? "run.refused" : "run.completed",
        "run",
        "completed",
      ),
    );
  });
}

describe("App", () => {
  beforeEach(() => {
    vi.mocked(generateReinforcement).mockResolvedValue(reinforcementReady);
    vi.mocked(submitReinforcementAnswer).mockResolvedValue(reinforcementReady);
    vi.mocked(getTutorRun).mockResolvedValue(completedRun);
    vi.mocked(synthesizeSpeech).mockResolvedValue({
      blob: new Blob(["speech"], { type: "audio/mpeg" }),
      voiceSessionId: "194bdce5-8a48-49ec-99f3-82ae1460f350",
      model: "fake-tts",
      provider: "naijalingo",
      apiVersion: "v1",
      voice: "ada_pcm",
      voiceId: "ada_pcm",
      format: "wav",
      latencyMs: 50,
      estimatedCostUsd: 0.001,
      estimatedCost: 0.001,
      costStatus: "estimated",
      pricingCurrency: "USD",
      pricingVersion: "api-pricing-test",
      pricingEffectiveDate: "2026-07-24",
      outputByteCount: 6,
      characterCount: 20,
      chunkCount: 1,
      providerCharacterCost: 20,
      pricingRatePerThousandCharacters: 0.05,
    });
    vi.mocked(transcribeAudio).mockResolvedValue({
      transcript: "What is energy?",
      language: "en",
      model: "fake-asr",
      latencyMs: 40,
      estimatedCostUsd: 0.0001,
      voiceSessionId: "194bdce5-8a48-49ec-99f3-82ae1460f350",
    });
  });

  it("keeps typed input functional and requires editable transcript confirmation", async () => {
    successfulStream(completedRun);
    render(<App />);
    const submit = screen.getByRole("button", { name: "Run grounded tutor" });
    expect(submit).toBeDisabled();

    const user = userEvent.setup();
    const transcript = screen.getByLabelText("Editable question transcript");
    await user.type(transcript, "What is energey?");
    expect(submit).toBeDisabled();
    await user.clear(transcript);
    await user.type(transcript, "What is energy?");
    await user.click(
      screen.getByLabelText(
        "I reviewed this transcript and it asks the question I intend.",
      ),
    );
    expect(submit).toBeEnabled();
    await user.click(submit);

    await waitFor(() => expect(streamTutorRun).toHaveBeenCalledTimes(1));
    expect(streamTutorRun).toHaveBeenCalledWith(
      {
        question: "What is energy?",
        language: "en",
        preferredLanguage: "pcm",
      },
      expect.any(Function),
      expect.any(AbortSignal),
    );
  });

  it("renders live trace, retrieved chunks, citations, and grounded speech", async () => {
    successfulStream(completedRun);
    render(<App />);
    const user = await typeAndConfirm();
    await user.click(
      screen.getByRole("button", { name: "Run grounded tutor" }),
    );

    expect(await screen.findByText("agent · started")).toBeVisible();
    expect(await screen.findByText("Energy and work")).toBeVisible();
    expect(screen.getByText("0.9100 hybrid")).toBeVisible();
    expect(await screen.findByText("Grounded answer")).toBeVisible();
    expect(screen.getByText(/Energy na di power to do work\./)).toBeVisible();
    expect(
      screen.getByText("Source 1: Basic Science Text, page 12"),
    ).toBeVisible();
    expect(screen.getAllByText(/chunk-energy-01/)[0]).toBeVisible();
    expect(screen.getByText("AI-generated tutor voice.")).toBeVisible();
    expect(screen.getByText(/Provider: 9jaLingo/)).toBeVisible();
    expect(screen.getByText(/Model: fake-tts/)).toBeVisible();
    expect(synthesizeSpeech).toHaveBeenCalledWith(
      completedRun.runId,
      expect.any(AbortSignal),
    );
  });

  it("hides internal citation IDs from a saved grounded answer", async () => {
    const citationRun: TutorRun = {
      ...completedRun,
      finalAnswer: "Energy is the capacity to do work. [chunk-energy-01]",
      translatedAnswer: "Energy na di power to do work. [chunk-energy-01]",
    };
    successfulStream(citationRun);
    vi.mocked(getTutorRun).mockResolvedValue(citationRun);
    render(<App />);
    const user = await typeAndConfirm();
    await user.click(
      screen.getByRole("button", { name: "Run grounded tutor" }),
    );

    const answerPanel = (await screen.findByText("Grounded answer")).closest(
      "section",
    );
    expect(answerPanel).not.toBeNull();
    expect(
      within(answerPanel as HTMLElement).queryByText(/\[chunk-energy-01\]/),
    ).not.toBeInTheDocument();
    expect(
      within(answerPanel as HTMLElement).getByText(
        "Source 1: Basic Science Text, page 12",
      ),
    ).toBeVisible();
  });

  it("renders escaped Gemini formatting without visible Markdown source", async () => {
    const escapedRun: TutorRun = {
      ...completedRun,
      translatedAnswer:
        "Introduction.\\n\\n## Wetin be cell?\\n\\nA **cell** na unit of life.",
    };
    successfulStream(escapedRun);
    vi.mocked(getTutorRun).mockResolvedValue(escapedRun);
    render(<App />);
    const user = await typeAndConfirm();
    await user.click(
      screen.getByRole("button", { name: "Run grounded tutor" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Wetin be cell?" }),
    ).toBeVisible();
    expect(screen.getByText("cell", { selector: "strong" })).toBeVisible();
    expect(screen.queryByText(/\\n|##|\*\*/)).not.toBeInTheDocument();
  });

  it("renders tutor Markdown as structured lesson content without visible markers", async () => {
    const markdownRun: TutorRun = {
      ...completedRun,
      finalAnswer: `Hi, let us make this clearer together.

### First, what is a cell?

A **cell** is a basic unit of life.

- Cells carry out activities needed for life.`,
      translatedAnswer: `Hi, let us make this clearer together.

### First, what is a cell?

A **cell** is a basic unit of life.

- Cells carry out activities needed for life.`,
    };
    successfulStream(markdownRun);
    vi.mocked(getTutorRun).mockResolvedValue(markdownRun);
    render(<App />);
    const user = await typeAndConfirm("Please help me understand cells.");
    await user.click(
      screen.getByRole("button", { name: "Run grounded tutor" }),
    );

    const translatedLesson = document.querySelector(".answer-text");
    expect(translatedLesson).not.toBeNull();
    expect(
      within(translatedLesson as HTMLElement).getByRole("heading", {
        name: "First, what is a cell?",
      }),
    ).toBeVisible();
    expect(
      within(translatedLesson as HTMLElement).getByText("cell", {
        selector: "strong",
      }),
    ).toBeVisible();
    expect(
      within(translatedLesson as HTMLElement).getByText(
        "Cells carry out activities needed for life.",
        {
          selector: "li",
        },
      ),
    ).toBeVisible();
    expect(document.querySelector(".answer-text")?.textContent).not.toContain(
      "###",
    );
    expect(document.querySelector(".answer-text")?.textContent).not.toContain(
      "**",
    );
  });

  it("renders a distinct refusal and never requests TTS", async () => {
    successfulStream(refusedRun);
    vi.mocked(getTutorRun).mockResolvedValue(refusedRun);
    render(<App />);
    const user = await typeAndConfirm("Who won the football match?");
    await user.click(
      screen.getByRole("button", { name: "Run grounded tutor" }),
    );

    expect(
      await screen.findByText("Refused — evidence boundary held"),
    ).toBeVisible();
    expect(screen.getByText("NO GROUNDED ANSWER GENERATED")).toBeVisible();
    expect(screen.getByText(/Refusals remain text-only/)).toBeVisible();
    expect(synthesizeSpeech).not.toHaveBeenCalled();
  });

  it("accepts a typed learning-check answer and presents a hint after an incorrect response", async () => {
    successfulStream(completedRun);
    const incorrectState: ReinforcementState = {
      ...reinforcementReady,
      questions: [
        {
          ...reinforcementReady.questions[0]!,
          attemptsRemaining: 2,
          attempts: [
            {
              id: "91f39a7d-f0bd-4e12-a304-940947406b9b",
              questionId: reinforcementReady.activeQuestionId!,
              attemptNumber: 1,
              studentAnswer: "It makes objects heavier.",
              correct: false,
              feedback:
                "Good effort—you are thinking about the lesson. Try once more using the hint below.",
              hint: "Think about the action a system can perform.",
              createdAt: "2026-07-24T12:00:00.000Z",
            },
          ],
        },
      ],
    };
    vi.mocked(submitReinforcementAnswer).mockResolvedValue(incorrectState);
    render(<App />);
    const user = await typeAndConfirm();
    await user.click(
      screen.getByRole("button", { name: "Run grounded tutor" }),
    );

    expect(
      await screen.findByText(
        "What does energy allow a physical system to do?",
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Record my answer" }),
    ).toBeVisible();
    await user.type(
      screen.getByLabelText("Your answer"),
      "It makes objects heavier.",
    );
    await user.click(
      screen.getByLabelText(
        "I reviewed my answer and I am ready for feedback.",
      ),
    );
    await user.click(screen.getByRole("button", { name: "Check my answer" }));

    await waitFor(() =>
      expect(submitReinforcementAnswer).toHaveBeenCalledWith(
        completedRun.runId,
        {
          questionId: reinforcementReady.activeQuestionId,
          answer: "It makes objects heavier.",
        },
        expect.any(AbortSignal),
      ),
    );
    expect(
      await screen.findByText("Think about the action a system can perform."),
    ).toBeVisible();
  });

  it("keeps a completed answer visible and requires an explicit TTS retry", async () => {
    successfulStream(completedRun);
    vi.mocked(synthesizeSpeech).mockRejectedValueOnce(
      new Error("Speech synthesis is temporarily unavailable."),
    );
    render(<App />);
    const user = await typeAndConfirm();
    await user.click(
      screen.getByRole("button", { name: "Run grounded tutor" }),
    );

    expect(await screen.findByText("Grounded answer")).toBeVisible();
    expect(screen.getByText(/Written answer preserved/)).toBeVisible();
    expect(screen.getByText(completedRun.translatedAnswer!)).toBeVisible();
    expect(synthesizeSpeech).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Retry tutor voice" }));
    expect(await screen.findByText(/Provider: 9jaLingo/)).toBeVisible();
    expect(synthesizeSpeech).toHaveBeenCalledTimes(2);
  });

  it("lets the student retry a transient learning-check generation failure", async () => {
    successfulStream(completedRun);
    vi.mocked(generateReinforcement)
      .mockRejectedValueOnce(
        new Error("Reinforcement generation could not complete safely."),
      )
      .mockResolvedValueOnce(reinforcementReady);
    render(<App />);
    const user = await typeAndConfirm();
    await user.click(
      screen.getByRole("button", { name: "Run grounded tutor" }),
    );

    expect(
      await screen.findByText("Learning check unavailable."),
    ).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Try learning check again" }),
    );

    expect(
      await screen.findByText(
        "What does energy allow a physical system to do?",
      ),
    ).toBeVisible();
    expect(generateReinforcement).toHaveBeenCalledTimes(2);
  });

  it("shows safe tutor failures and prevents duplicate submissions", async () => {
    let release: (() => void) | undefined;
    vi.mocked(streamTutorRun).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    render(<App />);
    const user = await typeAndConfirm();
    const submit = screen.getByRole("button", { name: "Run grounded tutor" });
    await user.click(submit);
    expect(
      screen.getByRole("button", { name: "Tutor is working…" }),
    ).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Tutor is working…" }));
    expect(streamTutorRun).toHaveBeenCalledTimes(1);
    release?.();
  });
});
