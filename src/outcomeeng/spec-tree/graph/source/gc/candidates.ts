/**
 * Garbage-collection candidate derivation over source ownership
 * classifications. Candidacy is a function of classification alone — never of
 * a language import graph or any raw provider fact.
 *
 * @module outcomeeng/spec-tree/graph/source/gc/candidates
 */

import type { SourceOwnershipRecord } from "../kernel/classify";

/** Returns the records whose classification marks them garbage-collection candidates. */
export function deriveGarbageCollectionCandidates(
  _records: readonly SourceOwnershipRecord[],
): readonly SourceOwnershipRecord[] {
  throw new Error("deriveGarbageCollectionCandidates is not implemented");
}
