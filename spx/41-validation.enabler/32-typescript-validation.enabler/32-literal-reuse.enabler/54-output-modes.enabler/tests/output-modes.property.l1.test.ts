import { describe, expect, it } from "vitest";

import { formatFilesWithProblems, formatLiteralValues } from "@/commands/validation/literal";
import { LITERAL_KIND } from "@/validation/literal";
import { arbitraryDetectionResult, LITERAL_TEXT_LAYOUT } from "@testing/generators/literal/literal";
import { compareExpectedStrings } from "@testing/harnesses/literal/output-expectations";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";

describe("output-modes — properties", () => {
  it("--files-with-problems lists exactly the affected files, each once, sorted, independent of finding order", () => {
    assertProperty(
      arbitraryDetectionResult(),
      (findings) => {
        const lines = formatFilesWithProblems(findings).split(LITERAL_TEXT_LAYOUT.lineSeparator).filter(Boolean);
        const affectedFiles = new Set([...findings.srcReuse, ...findings.testDupe].map((finding) => finding.test.file));

        expect(new Set(lines)).toEqual(affectedFiles);
        expect(lines).toHaveLength(affectedFiles.size);
        expect(lines).toEqual([...lines].sort(compareExpectedStrings));
        const reordered = { srcReuse: [...findings.srcReuse].reverse(), testDupe: [...findings.testDupe].reverse() };
        expect(formatFilesWithProblems(reordered)).toBe(formatFilesWithProblems(findings));
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });

  it("--literals lists exactly the distinct literal values, kind-formatted, sorted, independent of finding order", () => {
    assertProperty(
      arbitraryDetectionResult(),
      (findings) => {
        const lines = formatLiteralValues(findings).split(LITERAL_TEXT_LAYOUT.lineSeparator).filter(Boolean);
        const renderedValues = new Set(
          [...findings.srcReuse, ...findings.testDupe].map((finding) =>
            finding.kind === LITERAL_KIND.STRING ? `"${finding.value}"` : finding.value
          ),
        );

        expect(new Set(lines)).toEqual(renderedValues);
        expect(lines).toHaveLength(renderedValues.size);
        const underlyingValues = lines.map((line) =>
          line.startsWith("\"") && line.endsWith("\"") ? line.slice(1, -1) : line
        );
        expect(underlyingValues).toEqual([...underlyingValues].sort(compareExpectedStrings));
        const reordered = { srcReuse: [...findings.srcReuse].reverse(), testDupe: [...findings.testDupe].reverse() };
        expect(formatLiteralValues(reordered)).toBe(formatLiteralValues(findings));
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });
});
