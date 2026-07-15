/**
 * Shared fact emission for the TypeScript provider descriptors: unique
 * (testPath, sourcePath) relations become raw facts carrying this language's
 * provenance, ordered by code units so emitted sequences are identical across
 * hosts.
 *
 * @module outcomeeng/spec-tree/graph/source/providers/typescript/emit
 */

import { compareCodeUnits } from "@/outcomeeng/spec-tree/graph/source/order";
import { type ProviderFactKind, type RawProviderFact, SOURCE_GRAPH_LANGUAGE } from "../descriptor";

/** One (testPath, sourcePath) relation a descriptor derives from its payload. */
export type TypescriptFactPair = readonly [testPath: string, sourcePath: string];

/** NUL cannot occur in a path, so the joined dedupe key is collision-free. */
const PAIR_KEY_SEPARATOR = "\u0000";

/** Unique pairs as facts with the emitting tool's provenance, in code-unit order. */
export function emitTypescriptFacts(
  kind: ProviderFactKind,
  provider: string,
  pairs: readonly TypescriptFactPair[],
): readonly RawProviderFact[] {
  const seen = new Set<string>();
  const unique: TypescriptFactPair[] = [];
  for (const pair of pairs) {
    const key = `${pair[0]}${PAIR_KEY_SEPARATOR}${pair[1]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(pair);
  }
  return unique
    .sort((left, right) => compareCodeUnits(left[0], right[0]) || compareCodeUnits(left[1], right[1]))
    .map(([testPath, sourcePath]) => ({
      kind,
      testPath,
      sourcePath,
      provenance: { language: SOURCE_GRAPH_LANGUAGE.TYPESCRIPT, provider },
    }));
}
