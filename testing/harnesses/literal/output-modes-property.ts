import { describe, expect, it } from "vitest";

import { formatFilesWithProblems, formatLiteralValues } from "@/commands/validation/literal";
import { arbitraryDetectionResult, LITERAL_TEXT_LAYOUT } from "@testing/generators/literal/literal";
import { expectedAffectedFiles, expectedLiteralLines } from "@testing/harnesses/literal/output-expectations";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";

export function registerLiteralOutputModeProperties(): void {
  describe("output-modes — properties", () => {
    it("--files-with-problems always contains all finding test files, deduplicated and sorted", () => {
      assertProperty(
        arbitraryDetectionResult(),
        (findings) => {
          const output = formatFilesWithProblems(findings);
          const lines = output.split(LITERAL_TEXT_LAYOUT.lineSeparator).filter(Boolean);
          expect(lines).toEqual(expectedAffectedFiles(findings));
        },
        { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
      );
    });

    it("--literals always contains all finding literal values, deduplicated, sorted, and kind-formatted", () => {
      assertProperty(
        arbitraryDetectionResult(),
        (findings) => {
          const output = formatLiteralValues(findings);
          const lines = output.split(LITERAL_TEXT_LAYOUT.lineSeparator).filter(Boolean);

          expect(lines).toEqual(expectedLiteralLines(findings));
        },
        { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
      );
    });
  });
}
