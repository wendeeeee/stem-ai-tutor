import { describe, expect, it } from "vitest";
import { normalizeLessonText } from "./lessonText";

describe("normalizeLessonText", () => {
  it("restores escaped Gemini paragraph breaks", () => {
    expect(
      normalizeLessonText(
        "Introduction.\\n\\n## Wetin be cell?\\n\\nA **cell** na unit of life.",
      ),
    ).toBe("Introduction.\n\n## Wetin be cell?\n\nA **cell** na unit of life.");
  });
});
