import * as fc from "fast-check";

import {
  buildIndex,
  collectLiterals,
  createEmptyLiteralAllowlist,
  DEFAULT_LITERAL_COLLECT_OPTIONS,
  type DetectionResult,
  detectReuse,
  type LiteralIndex,
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
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
import { collectHarnessTestCases, describe, expect, it } from "@testing/harnesses/vitest-registration";

interface FixtureFile {
  readonly filename: string;
  readonly literal: string;
}

interface DetectionFixture {
  readonly srcFiles: readonly FixtureFile[];
  readonly testFiles: readonly FixtureFile[];
}

export function indexSources(
  ...sources: ReadonlyArray<readonly [string, string]>
): LiteralIndex {
  const all: LiteralOccurrence[] = [];
  for (const [filename, source] of sources) {
    all.push(...collectLiterals(source, filename, DEFAULT_LITERAL_COLLECT_OPTIONS));
  }
  return buildIndex(all);
}

export function testOccurrences(
  ...entries: ReadonlyArray<readonly [string, string]>
): ReadonlyMap<string, readonly LiteralOccurrence[]> {
  const map = new Map<string, readonly LiteralOccurrence[]>();
  for (const [filename, source] of entries) {
    map.set(filename, collectLiterals(source, filename, DEFAULT_LITERAL_COLLECT_OPTIONS));
  }
  return map;
}

export function collectFromSource(
  source: string,
  filename: string,
  options: typeof DEFAULT_LITERAL_COLLECT_OPTIONS = DEFAULT_LITERAL_COLLECT_OPTIONS,
): readonly LiteralOccurrence[] {
  return collectLiterals(source, filename, options);
}

export const literalDetectionPropertyCases = collectHarnessTestCases(() => {
  describe("detection — invariants", () => {
    it("is deterministic for the same fixture", () => {
      assertProperty(
        arbitraryDetectionFixture(),
        (fixture) => {
          expect(canonicalSort(collectFixture(fixture, naturalOrder(fixture))))
            .toEqual(canonicalSort(collectFixture(fixture, naturalOrder(fixture))));
        },
        { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
      );
    });

    it("is independent of file traversal order", () => {
      assertProperty(
        arbitraryDetectionFixture(),
        (fixture) => {
          expect(canonicalSort(collectFixture(fixture, reverseOrder(fixture))))
            .toEqual(canonicalSort(collectFixture(fixture, naturalOrder(fixture))));
        },
        { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
      );
    });

    it("builds injective index keys over literal kind and value", () => {
      assertProperty(
        fc.record({
          literal: arbitraryDomainNumber(),
          stringFilename: arbitrarySourceFilePath(),
          numberFilename: arbitrarySourceFilePath(),
        }),
        (entries) => {
          const value = String(entries.literal);
          expect(
            buildIndex([
              ...collectLiterals(
                buildStringDeclaration(value),
                entries.stringFilename,
                DEFAULT_LITERAL_COLLECT_OPTIONS,
              ),
              ...collectLiterals(
                buildNumericDeclaration(value),
                entries.numberFilename,
                DEFAULT_LITERAL_COLLECT_OPTIONS,
              ),
            ]).size,
          ).toBe(LITERAL_TEST_GENERATOR_COUNTS.two);
        },
        { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
      );
    });
  });
});

function arbitraryFixtureFile(filenameArbitrary: fc.Arbitrary<string>): fc.Arbitrary<FixtureFile> {
  return fc.record({
    filename: filenameArbitrary,
    literal: arbitraryDomainLiteral(),
  });
}

function arbitraryDetectionFixture(): fc.Arbitrary<DetectionFixture> {
  return fc.record({
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
}

function collectFixture(fixture: DetectionFixture, fileOrder: readonly FixtureFile[]): DetectionResult {
  const srcOccurrences: LiteralOccurrence[] = [];
  const testOccurrencesByFile = new Map<string, readonly LiteralOccurrence[]>();
  const srcFilenames = new Set(fixture.srcFiles.map((file) => file.filename));

  for (const file of fileOrder) {
    const occurrences = collectLiterals(
      srcFilenames.has(file.filename)
        ? buildStringDeclaration(file.literal)
        : buildStringAssertion(file.literal),
      file.filename,
      DEFAULT_LITERAL_COLLECT_OPTIONS,
    );
    if (srcFilenames.has(file.filename)) {
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
  const compareLocation = (first: { file: string; line: number }, second: { file: string; line: number }) =>
    first.file.localeCompare(second.file) || first.line - second.line;

  return {
    srcReuse: [...result.srcReuse].sort(
      (first, second) =>
        first.kind.localeCompare(second.kind)
        || first.value.localeCompare(second.value)
        || compareLocation(first.test, second.test),
    ),
    testDupe: [...result.testDupe].sort(
      (first, second) =>
        first.kind.localeCompare(second.kind)
        || first.value.localeCompare(second.value)
        || compareLocation(first.test, second.test),
    ),
  };
}

function reverseOrder(fixture: DetectionFixture): readonly FixtureFile[] {
  return [...fixture.srcFiles, ...fixture.testFiles].reverse();
}

function naturalOrder(fixture: DetectionFixture): readonly FixtureFile[] {
  return [...fixture.srcFiles, ...fixture.testFiles];
}
