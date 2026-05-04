import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { formatFilesWithProblems, formatLiteralValues } from "@/commands/validation/literal";
import {
  type DetectionResult,
  type DupeFinding,
  LITERAL_KIND,
  type LiteralLocation,
  REMEDIATION,
  type ReuseFinding,
} from "@/validation/literal/index";
import {
  arbitraryDomainLiteral,
  arbitrarySourceFilePath,
  arbitraryTestFilePath,
} from "@testing/generators/literal/literal";

const PROPERTY_RUN_COUNT = 32;
const FINDINGS_MAX_COUNT = 5;

function arbitraryLiteralLocation(fileArb: fc.Arbitrary<string>): fc.Arbitrary<LiteralLocation> {
  return fc.record({
    file: fileArb,
    line: fc.nat(),
  });
}

function arbitraryReuseFinding(): fc.Arbitrary<ReuseFinding> {
  return fc.record({
    kind: fc.constant(LITERAL_KIND.STRING),
    value: arbitraryDomainLiteral(),
    test: arbitraryLiteralLocation(arbitraryTestFilePath()),
    src: fc.array(arbitraryLiteralLocation(arbitrarySourceFilePath()), { minLength: 1, maxLength: 3 }),
    remediation: fc.constant(REMEDIATION.IMPORT_FROM_SOURCE),
  });
}

function arbitraryDupeFinding(): fc.Arbitrary<DupeFinding> {
  return fc.record({
    kind: fc.constant(LITERAL_KIND.STRING),
    value: arbitraryDomainLiteral(),
    test: arbitraryLiteralLocation(arbitraryTestFilePath()),
    otherTests: fc.array(arbitraryLiteralLocation(arbitraryTestFilePath()), {
      minLength: 1,
      maxLength: 3,
    }),
    remediation: fc.constant(REMEDIATION.REFACTOR_TO_SOURCE_OR_GENERATOR),
  });
}

function arbitraryDetectionResult(): fc.Arbitrary<DetectionResult> {
  return fc.record({
    srcReuse: fc.array(arbitraryReuseFinding(), { minLength: 1, maxLength: FINDINGS_MAX_COUNT }),
    testDupe: fc.array(arbitraryDupeFinding(), { minLength: 1, maxLength: FINDINGS_MAX_COUNT }),
  });
}

describe("output-modes — properties", () => {
  it("--files-with-problems always contains all finding test files, deduplicated and sorted", () => {
    fc.assert(
      fc.property(arbitraryDetectionResult(), (findings) => {
        const output = formatFilesWithProblems(findings);
        const lines = output.split("\n").filter(Boolean);

        // Every test.file from srcReuse and testDupe appears in the output (oracle from findings data)
        for (const finding of findings.srcReuse) {
          expect(lines).toContain(finding.test.file);
        }
        for (const finding of findings.testDupe) {
          expect(lines).toContain(finding.test.file);
        }

        // Output is sorted and contains no duplicate paths
        expect(new Set(lines).size).toBe(lines.length);
        expect(lines).toEqual([...lines].sort());
      }),
      { numRuns: PROPERTY_RUN_COUNT },
    );
  });

  it("--literals always contains all finding literal values, deduplicated, sorted, and double-quoted", () => {
    fc.assert(
      fc.property(arbitraryDetectionResult(), (findings) => {
        const output = formatLiteralValues(findings);
        const lines = output.split("\n").filter(Boolean);

        // Every literal value from srcReuse and testDupe appears quoted in the output (oracle from findings data)
        for (const finding of findings.srcReuse) {
          expect(lines).toContain(`"${finding.value}"`);
        }
        for (const finding of findings.testDupe) {
          expect(lines).toContain(`"${finding.value}"`);
        }

        // Output is sorted, contains no duplicates, and every line is double-quoted
        expect(new Set(lines).size).toBe(lines.length);
        expect(lines).toEqual([...lines].sort());
        for (const line of lines) {
          expect(line.startsWith("\"") && line.endsWith("\"")).toBe(true);
        }
      }),
      { numRuns: PROPERTY_RUN_COUNT },
    );
  });
});
