# Tutor-voice selection

## Current ElevenLabs revision

The selected provider/model/format are ElevenLabs API v1,
`eleven_flash_v2_5`, and `mp3_44100_128`. A voice ID is required, but no voice
is currently selected in repository configuration.

On 24 July 2026, the required authenticated read-only `GET /v2/voices` check was
attempted without printing the key or full account response. The configured
local credential returned HTTP 401. Because the available account voices,
labels, descriptions, and model compatibility could not be verified, this
revision does not invent a voice ID, reuse a documentation example ID, claim an
accent, or claim a live synthesis/listening result.

After the local credential is corrected, the repository owner should:

1. Query `GET /v2/voices` with the server-side key and shortlist existing
   English voices only; do not clone or create a voice.
2. Prefer an actually labelled Nigerian or suitable African English voice when
   available, without inferring an accent from a name.
3. Confirm compatibility with `eleven_flash_v2_5`.
4. Listen to controlled samples for warmth, clarity, pace, STEM terms, units,
   and equations through the existing run-only speech endpoint.
5. Store only the chosen `ELEVEN_LABS_VOICE_ID` and safe
   `ELEVEN_LABS_VOICE_NAME` in local/deployment configuration.
6. Run the bounded live evaluation and record the exact voice/model/format.

| Candidate | Verified accent label | Warmth | Clarity | Pace | STEM vocabulary | Tutor suitability |
|---|---|---|---|---|---|---|
| Not yet available | not assessed | not assessed | not assessed | not assessed | not assessed | not assessed |

This is an author listening assessment, not evidence of student preference. A
voice failure never triggers an automatic provider or voice fallback.

## Historical YarnGPT Milestone 6 decision

The original Milestone 6 selected YarnGPT voice **Chinenye**. Its bounded local
reliability pass made six successful synthesis calls with median latency
23,220 ms. Regina and Femi each had one successful check; Idera and Jude each
timed out at the 30-second ceiling. Human listening remained unassessed.

Those observations and the existing YarnGPT screenshots, recording, and live
evaluation are preserved as historical evidence only. They do not describe the
current ElevenLabs configuration and were not retroactively changed.
