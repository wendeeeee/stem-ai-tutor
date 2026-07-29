import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_Key,
});

const lesson = `
Photosynthesis is the process through which green plants
use sunlight to produce food from carbon dioxide and water.
`;

const prompt = `
Translate the following secondary-school Biology lesson from
English into Igbo, Yoruba and Hausa.

Requirements:
- Preserve the original scientific meaning.
- Use language appropriate for an SS1 student in Nigeria.
- Do not translate established scientific terms where doing so
  would make them inaccurate or confusing.
- Add the English scientific term in parentheses where helpful.
- Use correct Igbo and Yoruba diacritics.
- Use standard Nigerian Hausa written in the Latin alphabet.
- Do not add information that is absent from the lesson.
- Return valid JSON with these keys: igbo, yoruba, hausa.

Lesson:
${lesson}
`;

const response = await ai.models.generateContent({
  model: 'gemini-2.5-flash',
  contents: prompt,
});

console.log(response.text);