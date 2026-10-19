import { describe, expect, it } from "vitest";

import { digestRawBytes, digestUniversalNewlineText } from "@/lib/verification-input";
import { referenceSha256, VERIFICATION_INPUT_TEST_GENERATOR } from "@testing/generators/verification-input";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("verification input digests", () => {
  it("digests raw bytes as their SHA-256 for every byte sequence, independent of name or location", () => {
    assertProperty(
      VERIFICATION_INPUT_TEST_GENERATOR.fileScenario(),
      (scenario) => {
        expect(digestRawBytes(scenario.bytes)).toBe(referenceSha256(scenario.bytes));
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("gives texts differing only in CRLF, CR, and LF line endings one universal-newline digest", () => {
    assertProperty(
      VERIFICATION_INPUT_TEST_GENERATOR.lineEndingVariants(),
      (variants) => {
        expect(digestUniversalNewlineText(variants.first)).toBe(digestUniversalNewlineText(variants.second));
        expect(digestUniversalNewlineText(variants.first)).toBe(referenceSha256(variants.canonical));
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
