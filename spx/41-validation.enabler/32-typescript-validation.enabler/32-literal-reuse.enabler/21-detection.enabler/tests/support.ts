import { DEFAULT_MIN_NUMBER_DIGITS, DEFAULT_MIN_STRING_LENGTH } from "@/validation/literal/config";
import {
  buildIndex,
  collectLiterals,
  defaultVisitorKeys,
  type LiteralIndex,
  type LiteralOccurrence,
} from "@/validation/literal/index";

export const DETECTOR_OPTIONS = {
  visitorKeys: defaultVisitorKeys,
  minStringLength: DEFAULT_MIN_STRING_LENGTH,
  minNumberDigits: DEFAULT_MIN_NUMBER_DIGITS,
} as const;

export const EMPTY_ALLOWLIST: ReadonlySet<string> = new Set();

export function indexSources(
  ...sources: ReadonlyArray<readonly [string, string]>
): LiteralIndex {
  const all: LiteralOccurrence[] = [];
  for (const [filename, source] of sources) {
    all.push(...collectLiterals(source, filename, DETECTOR_OPTIONS));
  }
  return buildIndex(all);
}

export function testOccurrences(
  ...entries: ReadonlyArray<readonly [string, string]>
): ReadonlyMap<string, readonly LiteralOccurrence[]> {
  const map = new Map<string, readonly LiteralOccurrence[]>();
  for (const [filename, source] of entries) {
    map.set(filename, collectLiterals(source, filename, DETECTOR_OPTIONS));
  }
  return map;
}

export function collectFromSource(
  source: string,
  filename: string,
  options: typeof DETECTOR_OPTIONS = DETECTOR_OPTIONS,
): readonly LiteralOccurrence[] {
  return collectLiterals(source, filename, options);
}
