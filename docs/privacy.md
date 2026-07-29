# Privacy and provider data handling

This proof of concept is a system-level seminar artifact. It has no student
accounts and was not tested with students.

## Data sent to providers

OpenAI receives:

- transient microphone audio submitted to the ASR endpoint;
- confirmed tutor questions and bounded model inputs for the existing
  transformer/tutor/verifier workflow;
- approved curriculum text required by embeddings and grounded model calls;
- bounded reinforcement inputs.

ElevenLabs receives only the deterministic plain-text representation of the
canonical answer from a persisted completed, grounded, non-refused tutor run.
It does not receive microphone audio, the student's question, ASR transcript,
retrieved chunks, evidence, prompts, hidden reasoning, citations as separate
metadata, reinforcement questions or answers, account data, identifiers, or
arbitrary browser text.

OpenAI remains the ASR provider. This application does not use ElevenLabs STT,
agents, voice cloning, speech-to-speech, or reinforcement features. The browser
never receives provider credentials and never calls a provider directly.

## Application persistence

The application stores confirmed question text, canonical answers, retrieved
evidence/citations, safe trace and usage metadata, reinforcement state, and
voice metrics in PostgreSQL. Generated audio and microphone bytes remain
transient and are not persisted in PostgreSQL, Redis, BullMQ, upload storage,
logs, evaluation results, screenshots, or the repository.

Safe TTS metrics may include provider, API version, model, voice ID and display
name, format, character and output-byte counts, latency, safe failure code,
provider `character-cost`, and pricing metadata. They never contain
authorization values, answer text, or raw provider bodies. `character-cost` is
provider usage credits, not currency.

## ElevenLabs retention and content limitations

As reviewed on 24 July 2026, ElevenLabs
[documents](https://elevenlabs.io/docs/eleven-api/resources/zero-retention-mode)
that it retains data by default to enhance services, troubleshoot issues, and
maintain security. Its Zero Retention Mode is available only to eligible
Enterprise customers and is requested with `enable_logging=false`.

The default is therefore `ELEVEN_LABS_ENABLE_LOGGING=true`. This repository
does not claim zero provider-side retention and does not disable logging unless
the account is independently confirmed eligible. ElevenLabs'
[terms](https://elevenlabs.io/terms-of-use) grant rights to process content to
provide and improve services, and its
[privacy policy](https://elevenlabs.io/privacy-policy) describes storage and
processing through service providers. Those are provider statements, not
guarantees made by this repository.

Only approved curriculum-grounded answer content should enter the tutor corpus
or be synthesized. The repository owner must review current provider terms,
privacy policy, organizational requirements, and curriculum rights again
before manual deployment.

## Voice selection

A voice ID must come from the authenticated account. Documentation example IDs
must not be treated as the selected tutor voice. Voice selection requires an
author listening assessment for warmth, clarity, pace, accent description, and
STEM pronunciation. It is not student-preference evidence.

## Evaluation and evidence

Evaluation exports contain fixture questions, corpus/run identifiers,
retrieval/citation metadata, safe errors, usage, latency, and estimated cost.
They contain no keys, authorization headers, raw provider bodies, or audio.

Historical Milestone 6 YarnGPT results and screenshots remain labelled
YarnGPT. Current mock ElevenLabs results validate code paths only and do not
claim live synthesis or human listening. Before replacing evidence with
real-device captures, use a clean browser profile and remove notifications and
unrelated personal data.
