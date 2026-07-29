import { describe, expect, it } from "vitest";
import { stripCitationMarkers } from "./citationMarkers";

describe("stripCitationMarkers", () => {
  it("removes known IDs without removing scientific bracket notation", () => {
    expect(
      stripCitationMarkers(
        "Cells are alive. [chunk-id]\nUse concentration [mol/L].",
        ["chunk-id"],
      ),
    ).toBe("Cells are alive.\nUse concentration [mol/L].");
  });
});
