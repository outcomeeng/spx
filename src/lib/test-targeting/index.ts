/**
 * Positional product-path operand selection over a discovered test-file set — the shared capability
 * every verification surface that narrows work by product path consumes, per
 * `spx/29-verification-path-scope.pdr.md`. `spx test` and `spx verification <type> run` resolve
 * their operands here, so a file operand, a node operand, and the recursive widening mean one thing
 * across surfaces; the library is pure over its inputs and names no surface or language.
 */
import { applyPathFilter, normalizePathPrefix } from "@/config/primitives/path-filter";
import { SPEC_TREE_EVIDENCE_FILE } from "@/lib/spec-tree";
import { compareAsciiStrings } from "@/lib/state-store";

const TESTS_DIRECTORY_NAME = SPEC_TREE_EVIDENCE_FILE.DIRECTORY_NAME;
const PATH_SEGMENT_SEPARATOR = "/";

/**
 * The operand forms this vocabulary gives a name. The product-root operand normalizes to the empty
 * string — the form `normalizePathPrefix` produces for a bare dot — and selects the whole tree.
 */
export const TARGET_OPERAND = {
  PRODUCT_ROOT: ".",
} as const;

/** Whether the operand names the product root itself, so it encloses every discovered file. */
export function isProductRootOperand(operand: string): boolean {
  return normalizeTargetOperand(operand).length === 0;
}

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

export function normalizeTargetOperand(operand: string): string {
  return normalizePathPrefix(operand);
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
  const normalized = normalizeTargetOperand(operand);
  if (recursive || discovered.includes(normalized)) {
    return applyPathFilter(discovered, { include: [normalized] });
  }
  return applyPathFilter(discovered, {
    include: [`${normalized}${PATH_SEGMENT_SEPARATOR}${TESTS_DIRECTORY_NAME}`],
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
  return { selected: [...selected].sort(compareAsciiStrings), unresolved };
}
