import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  buildIndex,
  collectLiterals,
  createEmptyLiteralAllowlist,
  DEFAULT_LITERAL_COLLECT_OPTIONS,
  type DetectionResult,
  detectReuse,
  type LiteralOccurrence,
} from "@/validation/literal/index";
import {
  arbitraryDomainLiteral,
  arbitraryDomainNumber,
  arbitrarySourceFilePath,
  arbitraryTestFilePath,
  LITERAL_TEST_GENERATOR_COUNTS,
} from "@testing/generators/literal/literal";
import {
  buildNumericDeclaration,
  buildStringAssertion,
  buildStringDeclaration,
} from "@testing/harnesses/literal/snippets";

interface FixtureFile {
  readonly filename: string;
  readonly literal: string;
}

interface DetectionFixture {
  readonly srcFiles: readonly FixtureFile[];
  readonly testFiles: readonly FixtureFile[];
}

const arbitraryFixtureFile = (filenameArbitrary: fc.Arbitrary<string>): fc.Arbitrary<FixtureFile> =>
  fc.record({
    filename: filenameArbitrary,
    literal: arbitraryDomainLiteral(),
  });

const arbitraryDetectionFixture = (): fc.Arbitrary<DetectionFixture> =>
  fc.record({
    srcFiles: fc.uniqueArray(arbitraryFixtureFile(arbitrarySourceFilePath()), {
      minLength: LITERAL_TEST_GENERATOR_COUNTS.one,
      maxLength: LITERAL_TEST_GENERATOR_COUNTS.findingsMax,
      selector: (entry) => entry.filename,
    }),
    testFiles: fc.uniqueArray(arbitraryFixtureFile(arbitraryTestFilePath()), {
      minLength: LITERAL_TEST_GENERATOR_COUNTS.one,
      maxLength: LITERAL_TEST_GENERATOR_COUNTS.findingsMax,
      selector: (entry) => entry.filename,
    }),
  });

function collectFixture(
  fixture: DetectionFixture,
  fileOrder: readonly FixtureFile[],
): DetectionResult {
  const srcOccurrences: LiteralOccurrence[] = [];
  const testOccurrencesByFile = new Map<string, readonly LiteralOccurrence[]>();
  const srcFilenames = new Set(fixture.srcFiles.map((f) => f.filename));

  for (const file of fileOrder) {
    const isSource = srcFilenames.has(file.filename);
    const sourceText = isSource ? buildStringDeclaration(file.literal) : buildStringAssertion(file.literal);
    const occurrences = collectLiterals(sourceText, file.filename, DEFAULT_LITERAL_COLLECT_OPTIONS);
    if (isSource) {
      srcOccurrences.push(...occurrences);
    } else {
      testOccurrencesByFile.set(file.filename, occurrences);
    }
  }

  return detectReuse({
    srcIndex: buildIndex(srcOccurrences),
    testOccurrencesByFile,
    allowlist: createEmptyLiteralAllowlist(),
  });
}

function canonicalSort(result: DetectionResult): DetectionResult {
  const compareLocation = (a: { file: string; line: number }, b: { file: string; line: number }) =>
    a.file.localeCompare(b.file) || a.line - b.line;

  return {
    srcReuse: [...result.srcReuse].sort(
      (a, b) =>
        a.kind.localeCompare(b.kind)
        || a.value.localeCompare(b.value)
        || compareLocation(a.test, b.test),
    ),
    testDupe: [...result.testDupe].sort(
      (a, b) =>
        a.kind.localeCompare(b.kind)
        || a.value.localeCompare(b.value)
        || compareLocation(a.test, b.test),
    ),
  };
}

function reverseOrder(fixture: DetectionFixture): readonly FixtureFile[] {
  return [...fixture.srcFiles, ...fixture.testFiles].reverse();
}

function naturalOrder(fixture: DetectionFixture): readonly FixtureFile[] {
  return [...fixture.srcFiles, ...fixture.testFiles];
}

describe("detection — invariants", () => {
  it("detection is deterministic: running the detector twice over the same fixture yields deep-equal problems", () => {
    fc.assert(
      fc.property(arbitraryDetectionFixture(), (fixture) => {
        const first = collectFixture(fixture, naturalOrder(fixture));
        const second = collectFixture(fixture, naturalOrder(fixture));
        expect(canonicalSort(second)).toEqual(canonicalSort(first));
      }),
      { numRuns: LITERAL_TEST_GENERATOR_COUNTS.propertyRuns },
    );
  });

  it("detection is order-independent: running with files in two different orders yields canonically-sorted equal problems", () => {
    fc.assert(
      fc.property(arbitraryDetectionFixture(), (fixture) => {
        const forward = collectFixture(fixture, naturalOrder(fixture));
        const reversed = collectFixture(fixture, reverseOrder(fixture));
        expect(canonicalSort(reversed)).toEqual(canonicalSort(forward));
      }),
      { numRuns: LITERAL_TEST_GENERATOR_COUNTS.propertyRuns },
    );
  });

  it("index keys are injective on (kind, value), including same-value cross-kind entries", () => {
    fc.assert(
      fc.property(
        fc.record({
          literal: arbitraryDomainNumber(),
          stringFilename: arbitrarySourceFilePath(),
          numberFilename: arbitrarySourceFilePath(),
        }),
        (entries) => {
          const sameValue = String(entries.literal);
          const occurrences: LiteralOccurrence[] = [
            ...collectLiterals(
              buildStringDeclaration(sameValue),
              entries.stringFilename,
              DEFAULT_LITERAL_COLLECT_OPTIONS,
            ),
            ...collectLiterals(
              buildNumericDeclaration(sameValue),
              entries.numberFilename,
              DEFAULT_LITERAL_COLLECT_OPTIONS,
            ),
          ];
          const index = buildIndex(occurrences);
          expect(index.size).toBe(LITERAL_TEST_GENERATOR_COUNTS.two);
        },
      ),
      { numRuns: LITERAL_TEST_GENERATOR_COUNTS.propertyRuns },
    );
  });
});
