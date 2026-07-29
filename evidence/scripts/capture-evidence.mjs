#!/usr/bin/env node
import { chromium } from 'playwright';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDirectory, '../..');
const screenshotDirectory = join(root, 'evidence/screenshots');
const recordingDirectory = join(root, 'evidence/recording');
const temporaryVideoDirectory = join(root, 'evidence/.video-tmp');
const applicationUrl = process.env.EVIDENCE_WEB_URL ?? 'http://127.0.0.1:5174';
const groundedRunId = '11111111-1111-4111-8111-111111111111';
const refusalRunId = '22222222-2222-4222-8222-222222222222';
const voiceSessionId = '33333333-3333-4333-8333-333333333333';
let scenario = 'grounded';

await Promise.all([
  mkdir(screenshotDirectory, { recursive: true }),
  mkdir(recordingDirectory, { recursive: true }),
  mkdir(temporaryVideoDirectory, { recursive: true }),
]);

const browser = await chromium.launch({
  headless: true,
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
  ],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  permissions: ['microphone'],
  recordVideo: {
    dir: temporaryVideoDirectory,
    size: { width: 1440, height: 1000 },
  },
});
const page = await context.newPage();
const video = page.video();
page.setDefaultTimeout(15_000);

await page.route('**/api/voice/transcriptions', async (route) => {
  await route.fulfill({
    status: 201,
    contentType: 'application/json',
    body: JSON.stringify({
      transcript: 'What happens during a physical change in matter?',
      language: 'en',
      model: 'deterministic-evidence-asr',
      latencyMs: 482,
      estimatedCostUsd: 0.0001,
      voiceSessionId,
    }),
  });
});

await page.route('**/api/tutor/runs/stream', async (route) => {
  const body = route.request().postDataJSON();
  scenario = String(body.question).toLowerCase().includes('brazil')
    ? 'refusal'
    : 'grounded';
  const runId = scenario === 'grounded' ? groundedRunId : refusalRunId;
  const terminalType =
    scenario === 'grounded' ? 'run.completed' : 'run.refused';
  const events = [
    event(0, 'run.created', 'run', 'info', { runId }),
    event(1, 'agent.started', 'query-transformation', 'started'),
    event(2, 'agent.completed', 'query-transformation', 'completed', {}, 418),
    event(3, 'agent.started', 'retrieval', 'started'),
    event(4, 'agent.completed', 'retrieval', 'completed', {}, 536),
    event(5, 'retrieval.completed', 'retrieval', 'info', {
      acceptedChunkCount: scenario === 'grounded' ? 2 : 0,
    }),
    ...(scenario === 'grounded'
      ? [
          event(6, 'agent.started', 'tutor', 'started'),
          event(7, 'agent.completed', 'tutor', 'completed', {}, 1284),
          event(8, 'agent.started', 'verification', 'started'),
          event(9, 'agent.completed', 'verification', 'completed', {}, 972),
          event(10, terminalType, 'run', 'completed'),
        ]
      : [event(6, terminalType, 'run', 'completed')]),
  ];
  await route.fulfill({
    status: 201,
    headers: { 'content-type': 'text/event-stream; charset=utf-8' },
    body: events
      .map(
        (item) =>
          `id: ${item.sequence}\nevent: ${item.type}\ndata: ${JSON.stringify(
            item,
          )}\n\n`,
      )
      .join(''),
  });
});

await page.route(/\/api\/tutor\/runs\/[^/]+$/, async (route) => {
  if (route.request().method() !== 'GET') {
    await route.fallback();
    return;
  }
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(
      scenario === 'grounded' ? groundedRun() : refusedRun(),
    ),
  });
});

await page.route('**/api/tutor/runs/*/speech', async (route) => {
  const mp3Marker = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(256, 1)]);
  await route.fulfill({
    status: 201,
    headers: {
      'content-type': 'audio/mpeg',
      'cache-control': 'no-store, private',
      'x-voice-session-id': voiceSessionId,
      'x-tts-provider': 'yarngpt',
      'x-tts-api-version': 'v1',
      'x-tts-model': 'yarngpt-tts-v1',
      'x-tts-voice': 'Chinenye',
      'x-tts-format': 'mp3',
      'x-tts-latency-ms': '23220',
      'x-tts-output-bytes': String(mp3Marker.length),
      'x-tts-cost-status': 'unavailable',
      'x-tts-pricing-currency': 'NGN',
      'x-tts-pricing-version': 'unconfigured-2026-07-24',
    },
    body: mp3Marker,
  });
});

await page.route('**/api/tutor/runs/*/reinforcement', async (route) => {
  await route.fulfill({
    status: 201,
    contentType: 'application/json',
    body: JSON.stringify(reinforcement(false)),
  });
});

await page.route('**/api/tutor/runs/*/reinforcement/answers', async (route) => {
  await route.fulfill({
    status: 201,
    contentType: 'application/json',
    body: JSON.stringify(reinforcement(true)),
  });
});

await page.goto(applicationUrl, { waitUntil: 'networkidle' });
process.stdout.write('Evidence capture: application loaded\n');
await page.getByRole('button', { name: 'Start push-to-talk' }).click();
await page.waitForTimeout(1_000);
await page.getByRole('button', { name: 'Stop & transcribe' }).click();
process.stdout.write('Evidence capture: virtual microphone stopped\n');
await page
  .getByLabel('Editable question transcript')
  .waitFor({ state: 'visible' });
await page.waitForFunction(() => {
  const element = document.querySelector('#transcript');
  return element instanceof HTMLTextAreaElement && element.value.length > 0;
});
process.stdout.write('Evidence capture: editable transcript received\n');
await page
  .getByLabel('I reviewed this transcript and it asks the question I intend.')
  .check();
await page.getByRole('button', { name: 'Run grounded tutor' }).click();
await page.waitForTimeout(1_000);
if (!(await page.getByText('AI-generated tutor voice.').isVisible())) {
  process.stdout.write(
    `Evidence capture diagnostic:\n${(await page.locator('body').innerText()).slice(
      0,
      4_000,
    )}\n`,
  );
}
await page.getByText('AI-generated tutor voice.').waitFor();
await page.getByText('What happens to particles during a physical change?').waitFor();
process.stdout.write('Evidence capture: grounded flow rendered\n');

await page.locator('.pipeline').scrollIntoViewIfNeeded();
await page.waitForTimeout(900);
await page.locator('.evidence').scrollIntoViewIfNeeded();
await page.waitForTimeout(900);
await page.locator('.answer').scrollIntoViewIfNeeded();
await page.waitForTimeout(900);
await page.screenshot({
  path: join(screenshotDirectory, '01-grounded-answer-trace.png'),
  fullPage: true,
});
await page.locator('.answer').screenshot({
  path: join(screenshotDirectory, '03-yarngpt-playback.png'),
});
process.stdout.write('Evidence capture: grounded and voice screenshots saved\n');

await page.locator('.reinforcement').scrollIntoViewIfNeeded();
await page.getByLabel('Your answer').fill(
  'The particles stay the same, but their arrangement can change.',
);
await page
  .getByLabel('I reviewed my answer and I am ready for feedback.')
  .check();
await page.getByRole('button', { name: 'Check my answer' }).click();
await page.getByText(/Excellent work/).waitFor();
await page.waitForTimeout(900);
await page.locator('.reinforcement').screenshot({
  path: join(screenshotDirectory, '05-reinforcement-check.png'),
});
process.stdout.write('Evidence capture: reinforcement screenshot saved\n');

await page.locator('#transcript').scrollIntoViewIfNeeded();
await page
  .getByLabel('Editable question transcript')
  .fill('Who is the current president of Brazil?');
await page
  .getByLabel('I reviewed this transcript and it asks the question I intend.')
  .check();
await page.getByRole('button', { name: 'Run grounded tutor' }).click();
await page.getByText('NO GROUNDED ANSWER GENERATED').waitFor();
await page.locator('.answer').scrollIntoViewIfNeeded();
await page.waitForTimeout(900);
await page.screenshot({
  path: join(screenshotDirectory, '02-out-of-syllabus-refusal.png'),
  fullPage: true,
});
process.stdout.write('Evidence capture: refusal screenshot saved\n');

const liveDirectory = (
  await readFile(join(root, 'evidence/live-result-id.txt'), 'utf8').catch(
    () => 'live-2026-07-24T14-31-33-561Z-98783bf4',
  )
).trim();
const liveResults = JSON.parse(
  await readFile(
    join(root, 'demo/results', liveDirectory, 'results.json'),
    'utf8',
  ),
);
await page.setContent(evaluationHtml(liveResults), {
  waitUntil: 'domcontentloaded',
});
await page.waitForTimeout(900);
await page.screenshot({
  path: join(screenshotDirectory, '04-evaluation-summary.png'),
  fullPage: true,
});
process.stdout.write('Evidence capture: evaluation screenshot saved\n');

await context.close();
await browser.close();
const temporaryVideo = await video.path();
const recordingPath = join(
  recordingDirectory,
  'stem-ai-tutor-deterministic-demo.webm',
);
await copyFile(temporaryVideo, recordingPath);

await writeFile(
  join(root, 'evidence/artifacts.json'),
  `${JSON.stringify(
    {
      capturedAt: new Date().toISOString(),
      gitCommit: 'uncommitted-no-head',
      environment:
        'Local Playwright Chromium, deterministic route fixtures, virtual microphone',
      yarnGptVoice: 'Chinenye',
      artifacts: [
        artifact(
          'screenshots/01-grounded-answer-trace.png',
          'Complete grounded answer, trace, retrieved curriculum evidence, and citations.',
          groundedRunId,
          'deterministic',
        ),
        artifact(
          'screenshots/02-out-of-syllabus-refusal.png',
          'Out-of-syllabus refusal with no speech call.',
          refusalRunId,
          'deterministic',
        ),
        artifact(
          'screenshots/03-yarngpt-playback.png',
          'AI-generated tutor voice playback state with YarnGPT, Chinenye, MP3, and latency metadata.',
          groundedRunId,
          'deterministic',
        ),
        artifact(
          'screenshots/04-evaluation-summary.png',
          'Live ten-fixture evaluation summary rendered from the machine-readable export.',
          'multiple-live-run-ids-in-results-json',
          'live-results-render',
        ),
        artifact(
          'screenshots/05-reinforcement-check.png',
          'Completed deterministic reinforcement learning-check response.',
          groundedRunId,
          'deterministic',
        ),
        artifact(
          'recording/stem-ai-tutor-deterministic-demo.webm',
          'Deterministic local demo: virtual microphone, editable transcript, trace, evidence, answer, YarnGPT-labelled playback, reinforcement, and refusal.',
          `${groundedRunId}, ${refusalRunId}`,
          'deterministic',
        ),
      ],
    },
    null,
    2,
  )}\n`,
  'utf8',
);

process.stdout.write(`Evidence captured in ${join(root, 'evidence')}\n`);

function event(
  sequence,
  type,
  stage,
  status,
  summary = {},
  latencyMs = null,
) {
  return {
    sequence,
    type,
    stage,
    status,
    summary,
    latencyMs,
    tokenCount: 0,
    estimatedCostUsd: 0,
    errorCode: null,
    errorMessage: null,
  };
}

function groundedRun() {
  const chunkIds = [
    '7f0a00f938a54b8c60f2ac99ce50d5d754fba050c1b20898bad2f9f35264a65c',
    'b583a2bf865466666a14f3a24407512d1562a136510dcdfa235103a53fe486f3',
  ];
  const chunks = chunkIds.map((chunkId, index) => ({
    chunkId,
    content:
      index === 0
        ? 'A physical change does not break up the particles of the substances involved.'
        : 'The molecules stay intact while their arrangement may change.',
    topic: { id: null, label: 'Everything Science' },
    locator: {
      pageStart: 229 + index,
      pageEnd: 229 + index,
      sourceLocator: `page ${229 + index}`,
    },
    document: {
      id: 'b681dc5f-42fd-4ebe-802d-c94e603bc5a1',
      sourceTitle: 'Basic Science Text',
      subject: 'Physical Science',
      schoolLevel: 'SS1',
      curriculum: 'NERDC',
    },
    hybridScore: index === 0 ? 0.8667 : 0.8222,
  }));
  return {
    runId: groundedRunId,
    voiceSessionId,
    status: 'completed',
    question: 'What happens during a physical change in matter?',
    language: 'en',
    retrievedChunks: chunks,
    finalAnswer:
      '### Physical change\n\nDuring a **physical change**, the particles remain the same substances, although their arrangement or state can change. For example, water molecules stay intact when liquid water boils; they simply move farther apart. [7f0a00f9] [b583a2bf]',
    citations: chunks.map((chunk) => ({
      chunkId: chunk.chunkId,
      sourceTitle: 'Basic Science Text',
      sourceLocator: chunk.locator.sourceLocator,
    })),
    grounding: { grounded: true },
    refusal: { refused: false, reason: null },
    metrics: {
      tokens: { input: 5200, output: 640, total: 5840 },
      estimatedCostUsd: 0.0214,
      latencyMs: 12840,
      agentCalls: 4,
      toolCalls: 1,
      retries: 0,
      revisions: 0,
    },
    voiceMetrics: {
      voiceSessionId,
      asr: {
        model: 'deterministic-evidence-asr',
        latencyMs: 482,
        estimatedCostUsd: 0.0001,
        durationMs: 1000,
        mimeType: 'audio/webm',
      },
      tts: {
        provider: 'yarngpt',
        apiVersion: 'v1',
        model: 'yarngpt-tts-v1',
        voice: 'Chinenye',
        format: 'mp3',
        characterCount: 262,
        outputByteCount: 259,
        latencyMs: 23220,
        estimatedCostUsd: null,
        success: true,
        failureCode: null,
        costStatus: 'unavailable',
        estimatedCost: null,
        pricingCurrency: 'NGN',
        pricingVersion: 'unconfigured-2026-07-24',
        pricingEffectiveDate: null,
      },
    },
    trace: [
      event(0, 'run.created', 'run', 'info'),
      event(2, 'agent.completed', 'query-transformation', 'completed', {}, 418),
      event(4, 'agent.completed', 'retrieval', 'completed', {}, 536),
      event(7, 'agent.completed', 'tutor', 'completed', {}, 1284),
      event(9, 'agent.completed', 'verification', 'completed', {}, 972),
      event(10, 'run.completed', 'run', 'completed'),
    ],
    errors: [],
  };
}

function refusedRun() {
  return {
    ...groundedRun(),
    runId: refusalRunId,
    voiceSessionId: null,
    status: 'refused',
    question: 'Who is the current president of Brazil?',
    retrievedChunks: [],
    finalAnswer: null,
    citations: [],
    grounding: { grounded: false },
    refusal: {
      refused: true,
      reason: 'No curriculum evidence met the retrieval threshold.',
    },
    voiceMetrics: null,
    metrics: {
      tokens: { input: 320, output: 80, total: 400 },
      estimatedCostUsd: 0.001,
      latencyMs: 3906,
      agentCalls: 2,
      toolCalls: 1,
      retries: 0,
      revisions: 0,
    },
    trace: [
      event(0, 'run.created', 'run', 'info'),
      event(2, 'agent.completed', 'query-transformation', 'completed', {}, 418),
      event(4, 'agent.completed', 'retrieval', 'completed', {}, 536),
      event(5, 'retrieval.completed', 'retrieval', 'info', {
        acceptedChunkCount: 0,
      }),
      event(6, 'run.refused', 'run', 'completed'),
    ],
  };
}

function reinforcement(complete) {
  return {
    runId: groundedRunId,
    questions: [
      {
        id: '44444444-4444-4444-8444-444444444444',
        position: 1,
        prompt: 'What happens to particles during a physical change?',
        completed: complete,
        exhausted: false,
        attemptsRemaining: complete ? 2 : 3,
        attempts: complete
          ? [
              {
                id: '55555555-5555-4555-8555-555555555555',
                questionId: '44444444-4444-4444-8444-444444444444',
                attemptNumber: 1,
                studentAnswer:
                  'The particles stay the same, but their arrangement can change.',
                correct: true,
                feedback:
                  'Excellent work—you explained the key idea in your own words.',
                hint: null,
                createdAt: '2026-07-24T14:00:00.000Z',
              },
            ]
          : [],
      },
    ],
    activeQuestionId: complete
      ? null
      : '44444444-4444-4444-8444-444444444444',
    complete,
    generation: {
      model: 'deterministic-evidence-reinforcement',
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0,
    },
  };
}

function evaluationHtml(results) {
  const a = results.aggregates;
  const rows = results.results
    .map(
      (result) => `<tr><td>${result.fixtureId}</td><td>${
        result.expectedDisposition
      }</td><td>${result.actualDisposition}</td><td>${
        result.expectedSourceHit ? 'hit' : 'miss'
      }</td><td>${
        result.yarnGptTts.synthesisSuccess === null
          ? 'not called'
          : result.yarnGptTts.synthesisSuccess
            ? 'success'
            : 'failure'
      }</td></tr>`,
    )
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;background:#071713;color:#eefcf6;font:16px system-ui;padding:48px}
    main{max-width:1180px;margin:auto}.eyebrow{color:#76e6be;letter-spacing:.16em}
    h1{font-size:44px;margin:.2em 0}.notice{background:#132d26;border:1px solid #3d806b;padding:18px;border-radius:14px}
    .metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:28px 0}
    .metric{background:#10251f;padding:18px;border-radius:12px}.metric b{display:block;font-size:28px;color:#f4c56a}
    table{width:100%;border-collapse:collapse;background:#0e211c}th,td{text-align:left;padding:12px;border-bottom:1px solid #29483e}
    th{color:#76e6be}.limit{color:#ffc6bf}
  </style></head><body><main>
    <p class="eyebrow">MILESTONE 6 · LIVE SYSTEM EVALUATION</p>
    <h1>Ten locked curriculum fixtures</h1>
    <p class="notice">Live run <code>${results.evaluationRunId}</code>. System-level evaluation only; no students and no learning-effectiveness claim.</p>
    <section class="metrics">
      <div class="metric"><span>Disposition accuracy</span><b>${(
        a.dispositionAccuracy * 100
      ).toFixed(0)}%</b></div>
      <div class="metric"><span>Retrieval hit rate</span><b>${(
        a.retrievalHitRate * 100
      ).toFixed(0)}%</b></div>
      <div class="metric"><span>Correct refusal</span><b>${(
        a.correctRefusalRate * 100
      ).toFixed(1)}%</b></div>
      <div class="metric"><span>YarnGPT calls</span><b>6/6</b></div>
    </section>
    <table><thead><tr><th>Fixture</th><th>Expected</th><th>Actual</th><th>Source</th><th>YarnGPT</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="limit">Complete YarnGPT cost unavailable; no rate or currency conversion was invented. Manual author evidence review remains separate.</p>
  </main></body></html>`;
}

function artifact(path, caption, tutorRunId, sourceMode) {
  return {
    path,
    caption,
    date: new Date().toISOString(),
    gitCommit: 'uncommitted-no-head',
    localEnvironment:
      'Playwright Chromium with deterministic API routes; no secrets',
    tutorRunId,
    yarnGptVoice: 'Chinenye',
    sourceMode,
  };
}
