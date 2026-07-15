/**
 * Ordinal code-unit ordering for source graph output. One owning comparator
 * keeps every emitted sequence a pure function of the input strings; a
 * locale-aware comparator would vary with the host ICU build.
 *
 * @module outcomeeng/spec-tree/graph/source/order
 */

/** Compares two strings by UTF-16 code units, independent of host locale. */
export function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
