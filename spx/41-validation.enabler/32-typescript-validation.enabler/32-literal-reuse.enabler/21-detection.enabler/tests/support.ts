import {
  buildIndex,
  collectLiterals,
  createEmptyLiteralAllowlist,
  DEFAULT_LITERAL_COLLECT_OPTIONS,
  type LiteralIndex,
  type LiteralOccurrence,
} from "@/validation/literal/index";

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

export function emptyAllowlist(): ReadonlySet<string> {
  return createEmptyLiteralAllowlist();
}
