/**
 * The canonical answer contract is provider-independent. SpeechService applies
 * the selected provider and model ceiling separately so an incompatible
 * operator configuration fails safely without truncating the persisted answer.
 */
export const TUTOR_ANSWER_MAX_CHARACTERS = 8_000;
