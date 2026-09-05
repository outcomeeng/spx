import { describe, it } from "vitest";

import { encodeTranscriptText, transcriptBytesCarry } from "@/domains/agent/search";

import { arbitraryTranscriptNeedleCase } from "@testing/generators/agent/search";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("agent search — byte-scan candidacy", () => {
  it("admits a transcript by its bytes exactly when its text contains the needle", async () => {
    await assertProperty(
      arbitraryTranscriptNeedleCase(),
      ({ content, needle }): boolean =>
        transcriptBytesCarry(encodeTranscriptText(content), needle) === content.includes(needle),
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
