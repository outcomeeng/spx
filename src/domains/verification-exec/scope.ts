/**
 * The selector an spx-driven verification run records: the narrowest product-relative directory
 * enclosing every path operand the caller supplied, or the spec-tree root when none was. A run has
 * one selector while its coverage is the module scope the runner streams, so the selector is an
 * addressing key for the run rather than its coverage claim; the narrowest enclosing directory is
 * the deterministic key that names what the caller asked for.
 */
import { SPEC_TREE_CONFIG } from "@/lib/spec-tree";
import { isProductRootOperand, normalizeTargetOperand } from "@/lib/test-targeting";

const PATH_SEGMENT_SEPARATOR = "/";

function parentDirectorySegments(segments: readonly string[]): readonly string[] {
  return segments.slice(0, -1);
}

function commonPrefix(paths: ReadonlyArray<readonly string[]>): readonly string[] {
  if (paths.length === 0) return [];
  const [first, ...rest] = paths;
  let length = first.length;
  for (const other of rest) {
    let shared = 0;
    while (shared < length && shared < other.length && first[shared] === other[shared]) shared += 1;
    length = shared;
  }
  return first.slice(0, length);
}

/**
 * The run selector for the given operands over the discovered test files: an operand naming a
 * discovered test file contributes its directory, an operand naming the product root contributes
 * nothing because it encloses the whole tree, any other operand contributes itself, and the
 * selector is the directory those share — the spec-tree root when they share none or when no
 * operand was given.
 */
export function executeRunScopeIdentity(
  operands: readonly string[],
  discoveredTestFiles: readonly string[],
): string {
  if (operands.length === 0) return SPEC_TREE_CONFIG.ROOT_DIRECTORY;
  const discovered = new Set(discoveredTestFiles);
  const enclosing = operands.map((operand) => {
    // A product-root operand encloses the whole tree, so it contributes no segment; splitting its
    // empty normalized form would instead yield one empty segment and name a root-relative key the
    // recorder rejects.
    if (isProductRootOperand(operand)) return [];
    const normalized = normalizeTargetOperand(operand);
    const segments = normalized.split(PATH_SEGMENT_SEPARATOR);
    return discovered.has(normalized) ? parentDirectorySegments(segments) : segments;
  });
  const shared = commonPrefix(enclosing);
  return shared.length === 0 ? SPEC_TREE_CONFIG.ROOT_DIRECTORY : shared.join(PATH_SEGMENT_SEPARATOR);
}
