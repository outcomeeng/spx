import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  buildIndex,
  collectLiterals,
  type DetectionResult,
  detectReuse,
  type LiteralOccurrence,
} from "@/validation/literal/index";
import {
  arbitraryDomainLiteral,
  arbitrarySourceFilePath,
  arbitraryTestFilePath,
} from "@testing/generators/literal/literal";

import { DETECTOR_OPTIONS, EMPTY_ALLOWLIST } from "./support";

const PROPERTY_RUN_COUNT = 32;

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
      minLength: 1,
      maxLength: 4,
      selector: (entry) => entry.filename,
    }),
    testFiles: fc.uniqueArray(arbitraryFixtureFile(arbitraryTestFilePath()), {
      minLength: 1,
      maxLength: 4,
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
    const sourceText = isSource
      ? `export const VALUE = "${file.literal}";`
      : `expect(value).toBe("${file.literal}");`;
    const occurrences = collectLiterals(sourceText, file.filename, DETECTOR_OPTIONS);
    if (isSource) {
      srcOccurrences.push(...occurrences);
    } else {
      testOccurrencesByFile.set(file.filename, occurrences);
    }
  }

  return detectReuse({
    srcIndex: buildIndex(srcOccurrences),
    testOccurrencesByFile,
    allowlist: EMPTY_ALLOWLIST,
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
      { numRuns: PROPERTY_RUN_COUNT },
    );
  });

  it("detection is order-independent: running with files in two different orders yields canonically-sorted equal problems", () => {
    fc.assert(
      fc.property(arbitraryDetectionFixture(), (fixture) => {
        const forward = collectFixture(fixture, naturalOrder(fixture));
        const reversed = collectFixture(fixture, reverseOrder(fixture));
        expect(canonicalSort(reversed)).toEqual(canonicalSort(forward));
      }),
      { numRuns: PROPERTY_RUN_COUNT },
    );
  });

  it("index keys are injective on (kind, value): distinct (kind, value) pairs occupy distinct keys in the built index", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(
          fc.record({
            literal: arbitraryDomainLiteral(),
            filename: arbitrarySourceFilePath(),
          }),
          { minLength: 2, maxLength: 6, selector: (entry) => entry.literal },
        ),
        (entries) => {
          const occurrences: LiteralOccurrence[] = [];
          for (const entry of entries) {
            occurrences.push(
              ...collectLiterals(
                `export const V = "${entry.literal}";`,
                entry.filename,
                DETECTOR_OPTIONS,
              ),
            );
          }
          const index = buildIndex(occurrences);
          expect(index.size).toBe(entries.length);
        },
      ),
      { numRuns: PROPERTY_RUN_COUNT },
    );
  });
});
