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
import type { LiteralDetectionFixture, LiteralDetectionFixtureFile } from "@testing/generators/literal/literal";

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

export function collectDetectionFixture(fixture: LiteralDetectionFixture): DetectionResult {
  return collectFixture(fixture, naturalOrder(fixture));
}

export function collectReversedDetectionFixture(fixture: LiteralDetectionFixture): DetectionResult {
  return collectFixture(fixture, reverseOrder(fixture));
}

function collectFixture(
  fixture: LiteralDetectionFixture,
  fileOrder: readonly LiteralDetectionFixtureFile[],
): DetectionResult {
  const srcOccurrences: LiteralOccurrence[] = [];
  const testOccurrencesByFile = new Map<string, readonly LiteralOccurrence[]>();
  const srcFilenames = new Set(fixture.srcFiles.map((file) => file.filename));

  for (const file of fileOrder) {
    const occurrences = collectLiterals(
      file.source,
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

export function canonicalizeDetectionResult(result: DetectionResult): DetectionResult {
  const compareLocation = (first: { file: string; line: number }, second: { file: string; line: number }) =>
    first.file.localeCompare(second.file) || first.line - second.line;
  // Findings cite a set of source (or sibling-test) locations; their array order
  // reflects file traversal order and is not part of the order-independent
  // finding identity, so normalize the inner arrays before comparing.
  const sortLocations = <T extends { file: string; line: number }>(locations: readonly T[]): T[] =>
    [...locations].sort(compareLocation);

  return {
    srcReuse: [...result.srcReuse]
      .map((finding) => ({ ...finding, src: sortLocations(finding.src) }))
      .sort(
        (first, second) =>
          first.kind.localeCompare(second.kind)
          || first.value.localeCompare(second.value)
          || compareLocation(first.test, second.test),
      ),
    testDupe: [...result.testDupe]
      .map((finding) => ({ ...finding, otherTests: sortLocations(finding.otherTests) }))
      .sort(
        (first, second) =>
          first.kind.localeCompare(second.kind)
          || first.value.localeCompare(second.value)
          || compareLocation(first.test, second.test),
      ),
  };
}

function reverseOrder(fixture: LiteralDetectionFixture): readonly LiteralDetectionFixtureFile[] {
  return [...fixture.srcFiles, ...fixture.testFiles].reverse();
}

function naturalOrder(fixture: LiteralDetectionFixture): readonly LiteralDetectionFixtureFile[] {
  return [...fixture.srcFiles, ...fixture.testFiles];
}
