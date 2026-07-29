# Seminar evidence

This directory contains historical local Milestone 6 YarnGPT evidence. It
predates the ElevenLabs provider revision and must not be presented as
ElevenLabs validation. The artifact-level caption,
date, git state, environment, tutor run ID, YarnGPT voice, and source mode are
recorded in [`artifacts.json`](artifacts.json).

## Captured artifacts

| Artifact | Caption | Source |
|---|---|---|
| [01-grounded-answer-trace.png](screenshots/01-grounded-answer-trace.png) | Complete grounded run, persisted trace, evidence, answer, and citations | Deterministic browser fixture |
| [02-out-of-syllabus-refusal.png](screenshots/02-out-of-syllabus-refusal.png) | Out-of-syllabus refusal; speech not called | Deterministic browser fixture |
| [03-yarngpt-playback.png](screenshots/03-yarngpt-playback.png) | AI-generated tutor-voice controls with YarnGPT, Chinenye, MP3, and latency | Deterministic browser fixture |
| [04-evaluation-summary.png](screenshots/04-evaluation-summary.png) | Ten-fixture live evaluation result | Rendered from live JSON export |
| [05-reinforcement-check.png](screenshots/05-reinforcement-check.png) | Completed bounded learning check | Deterministic browser fixture |
| [stem-ai-tutor-deterministic-demo.webm](recording/stem-ai-tutor-deterministic-demo.webm) | Local visual sequence from microphone action through refusal | Deterministic browser fixture |

The screenshots are real captures of the React application rendered in local
Playwright Chromium. The routes are deterministic and contain no provider key,
personal notification, unrelated data, or raw provider response. The
evaluation-summary screenshot is based on the live run, while the remaining UI
screenshots use clearly identified fixture run IDs.

## Recording limitation

The WebM demonstrates microphone activation with Chromium's virtual media
device, editable transcription, trace progression, retrieved evidence, cited
answer, YarnGPT-labelled playback controls, reinforcement response, and refusal.
It does **not** contain a real person's spoken question, a real microphone
recording, or audible live YarnGPT output. It is safe fallback evidence, not the
final narrated seminar recording.

The repository owner must still capture the final local demonstration with a
real microphone and audible transient YarnGPT playback before publication.
That recording must avoid keys, environment screens, notifications, and personal
data. Do not replace the deterministic artifact without updating
`artifacts.json`.

## Reproduce the deterministic capture

Install the pinned browser once:

```bash
npm install
npx playwright install --with-deps chromium
```

Run the web client and capture:

```bash
npm run start:dev --workspace web -- --host 127.0.0.1 --port 5174
npm run evidence:capture
```

The script intercepts local API routes and never spends provider credit. The
production application has no evidence fixture mode and no arbitrary text TTS
route.

## Real-device capture checklist

Before the repository owner records the final seminar evidence:

1. Start the complete application locally at the documented 0.65 retrieval
   threshold with `TTS_PROVIDER=yarngpt`.
2. Confirm the API health/readiness response and all migrations.
3. Use a clean browser profile on localhost, grant microphone permission, and
   ask a locked supported fixture aloud.
4. Correct and confirm the transcript, then show SSE trace, evidence, citations,
   grounded answer, YarnGPT/Chinenye metadata, and playback.
5. Complete one typed reinforcement response.
6. run an out-of-syllabus fixture and show that no YarnGPT metric/session is
   created for it.
7. Repeat the core flow on a second browser/device when practical.
8. Record captions, commit, environment, actual tutor run IDs, voice, and
   `live` source mode for every replacement artifact.
