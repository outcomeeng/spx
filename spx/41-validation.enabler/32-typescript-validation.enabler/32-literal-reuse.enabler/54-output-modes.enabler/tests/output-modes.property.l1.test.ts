import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { formatFilesWithProblems, formatLiteralValues } from "@/commands/validation/literal";
import { compareAsciiStrings } from "@/lib/state-store";
import {
  arbitraryDetectionResult,
  LITERAL_TEST_GENERATOR_COUNTS,
  LITERAL_TEXT_LAYOUT,
} from "@testing/generators/literal/literal";

describe("output-modes — properties", () => {
  it("--files-with-problems always contains all finding test files, deduplicated and sorted", () => {
    fc.assert(
      fc.property(arbitraryDetectionResult(), (findings) => {
        const output = formatFilesWithProblems(findings);
        const lines = output.split(LITERAL_TEXT_LAYOUT.lineSeparator).filter(Boolean);

        // Every test.file from srcReuse and testDupe appears in the output (oracle from findings data)
        for (const finding of findings.srcReuse) {
          expect(lines).toContain(finding.test.file);
        }
        for (const finding of findings.testDupe) {
          expect(lines).toContain(finding.test.file);
        }

        // Output is sorted and contains no duplicate paths
        expect(new Set(lines).size).toBe(lines.length);
        expect(lines).toEqual([...lines].sort(compareAsciiStrings));
      }),
      { numRuns: LITERAL_TEST_GENERATOR_COUNTS.propertyRuns },
    );
  });

  it("--literals always contains all finding literal values, deduplicated, sorted, and double-quoted", () => {
    fc.assert(
      fc.property(arbitraryDetectionResult(), (findings) => {
        const output = formatLiteralValues(findings);
        const lines = output.split(LITERAL_TEXT_LAYOUT.lineSeparator).filter(Boolean);

        // Every literal value from srcReuse and testDupe appears quoted in the output (oracle from findings data)
        for (const finding of findings.srcReuse) {
          expect(lines).toContain(`"${finding.value}"`);
        }
        for (const finding of findings.testDupe) {
          expect(lines).toContain(`"${finding.value}"`);
        }

        // Output is sorted, contains no duplicates, and every line is double-quoted
        expect(new Set(lines).size).toBe(lines.length);
        expect(lines).toEqual([...lines].sort(compareAsciiStrings));
        for (const line of lines) {
          expect(line.startsWith("\"") && line.endsWith("\"")).toBe(true);
        }
      }),
      { numRuns: LITERAL_TEST_GENERATOR_COUNTS.propertyRuns },
    );
  });
});
