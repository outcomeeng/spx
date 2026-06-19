import { applyPathFilter } from "@/config/primitives/path-filter";
import { SPEC_TREE_EVIDENCE_FILE } from "@/lib/spec-tree";

const TESTS_DIRECTORY_NAME = SPEC_TREE_EVIDENCE_FILE.DIRECTORY_NAME;
const PATH_SEGMENT_SEPARATOR = "/";

/** Operand-selection request: the caller's operands and whether node operands recurse. */
export interface TargetSelection {
  /** Product-root-relative operands after `--`: node paths or test-file paths. */
  readonly operands: readonly string[];
  /** When true, a node-path operand selects its whole subtree, not only its own `tests/`. */
  readonly recursive: boolean;
}

/** The discovered files a selection resolves to, plus the operands that matched nothing. */
export interface TargetResolution {
  /** Selected discovered files, deduplicated and in ascending order. */
  readonly selected: readonly string[];
  /** Operands that matched no discovered test file, in input order. */
  readonly unresolved: readonly string[];
}

// A single operand's matches against the discovered set. An exact file operand, or
// any operand under `recursive`, uses the operand itself as the include prefix — it
// matches the file exactly or the whole node subtree. A default node operand uses
// the node's own `tests/` directory as the prefix, so a descendant node's `tests/`
// under `{operand}/{child}/` is left out.
function matchOperand(
  discovered: readonly string[],
  operand: string,
  recursive: boolean,
): readonly string[] {
  if (recursive || discovered.includes(operand)) {
    return applyPathFilter(discovered, { include: [operand] });
  }
  return applyPathFilter(discovered, {
    include: [`${operand}${PATH_SEGMENT_SEPARATOR}${TESTS_DIRECTORY_NAME}`],
  });
}

/**
 * Resolves explicit caller operands against the discovered test-file set. Each
 * operand selects a test-file path exactly, a node's own `tests/` files, or — under
 * `recursive` — the node's whole subtree; an operand matching no discovered file is
 * reported as unresolved. The selected set is the deduplicated, ascending union
 * across operands, so resolution is independent of operand order and repetition.
 */
export function resolveTargetedTestFiles(
  discovered: readonly string[],
  selection: TargetSelection,
): TargetResolution {
  const selected = new Set<string>();
  const unresolved: string[] = [];
  for (const operand of selection.operands) {
    const matches = matchOperand(discovered, operand, selection.recursive);
    if (matches.length === 0) {
      unresolved.push(operand);
      continue;
    }
    for (const match of matches) selected.add(match);
  }
  return { selected: [...selected].sort(compareAscii), unresolved };
}

function compareAscii(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
