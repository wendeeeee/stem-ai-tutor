const API_KEY  = process.env.NAIJALINGO_API_KEY ?? "nl-...";
const BASE_URL = "https://api.9jalingo.org";

const response = await fetch(`${BASE_URL}/v1/audio/speech`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-API-Key": API_KEY,
  },
  body: JSON.stringify({
    input: "Bawo ni, I dey greet you!",
    voice: "adeola_yo",  // speaker ID (alias: speaker)
    lang: "yo",          // language code (alias: language)
  }),
});

if (!response.ok) throw new Error(`TTS request failed: ${response.status}`);

const buffer = await response.arrayBuffer();
const { writeFileSync } = await import("fs");
writeFileSync("greeting.wav", Buffer.from(buffer));