/**
 * Positional product-path operand selection over a discovered test-file set — the shared capability
 * every verification surface that narrows work by product path consumes, realizing the product's
 * shared path-operand vocabulary. `spx test` and `spx verification <type> run` resolve
 * their operands here, so a file operand, a node operand, and the recursive widening mean one thing
 * across surfaces; the library is pure over its inputs and names no surface or language.
 */
import { isAbsolute, relative } from "node:path";

import { applyPathFilter, normalizePathPrefix } from "@/config/primitives/path-filter";
import { SPEC_TREE_EVIDENCE_FILE } from "@/lib/spec-tree";
import { compareAsciiStrings } from "@/lib/state-store";

const TESTS_DIRECTORY_NAME = SPEC_TREE_EVIDENCE_FILE.DIRECTORY_NAME;
const PATH_SEGMENT_SEPARATOR = "/";

/**
 * The operand forms this vocabulary gives a name. The product-root operand is the bare dot, spelled
 * relatively; it selects the whole tree.
 */
export const TARGET_OPERAND = {
  PRODUCT_ROOT: ".",
} as const;

/** The product root every operand is canonicalized against. */
export interface OperandResolutionContext {
  readonly productDir: string;
}

const PARENT_DIRECTORY = "..";
const PARENT_DIRECTORY_PREFIX = `${PARENT_DIRECTORY}${PATH_SEGMENT_SEPARATOR}`;

const WINDOWS_PATH_SEGMENT_SEPARATOR = "\\";

function isPathSeparator(character: string | undefined): boolean {
  return character === PATH_SEGMENT_SEPARATOR || character === WINDOWS_PATH_SEGMENT_SEPARATOR;
}

// The product root is recognized by its relative spellings before normalization — a bare dot with
// any run of trailing separators — because normalization also maps an empty operand to the empty
// string, and that spells no path at all.
function isProductRootSpelling(operand: string): boolean {
  let end = operand.length;
  while (end > 0 && isPathSeparator(operand[end - 1])) end -= 1;
  return operand.slice(0, end) === TARGET_OPERAND.PRODUCT_ROOT;
}

/**
 * The product-root-relative spelling an operand canonicalizes to: the empty string for the product
 * root itself — its relative spellings or its own absolute path — and `undefined` for an operand
 * that names no path inside the product: an empty operand, an absolute operand outside the root,
 * or a relative operand climbing out of it. An absolute operand inside the root resolves as
 * written, to the same spelling its product-root-relative form has.
 */
export function canonicalizeOperand(operand: string, productDir: string): string | undefined {
  if (operand.length === 0) return undefined;
  if (isProductRootSpelling(operand)) return "";
  const relativeToRoot = isAbsolute(operand) ? relative(productDir, operand) : operand;
  const normalized = normalizePathPrefix(relativeToRoot);
  if (normalized === PARENT_DIRECTORY || normalized.startsWith(PARENT_DIRECTORY_PREFIX)) return undefined;
  return normalized;
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

// A single operand's matches against the discovered set. An operand canonicalizing to
// the product root encloses the whole tree, so it selects every discovered file and the
// recursive modifier has nothing left to widen; an operand naming no path inside the
// product matches nothing. An exact file operand, or any other operand under
// `recursive`, uses its canonical spelling as the include prefix — it matches the file
// exactly or the whole node subtree. A default node operand uses the node's own
// `tests/` directory as the prefix, so a descendant node's `tests/` under
// `{operand}/{child}/` is left out.
function matchOperand(
  discovered: readonly string[],
  operand: string,
  recursive: boolean,
  productDir: string,
): readonly string[] {
  const canonical = canonicalizeOperand(operand, productDir);
  if (canonical === undefined) return [];
  if (canonical.length === 0) return [...discovered];
  if (recursive || discovered.includes(canonical)) {
    return applyPathFilter(discovered, { include: [canonical] });
  }
  return applyPathFilter(discovered, {
    include: [`${canonical}${PATH_SEGMENT_SEPARATOR}${TESTS_DIRECTORY_NAME}`],
  });
}

/**
 * Resolves explicit caller operands against the discovered test-file set, each canonicalized
 * against the product root. Each operand selects a test-file path exactly, a node's own `tests/`
 * files, or — under `recursive` — the node's whole subtree; an operand naming the product root
 * selects every discovered file, and an operand naming no path inside the product or matching no
 * discovered file is reported as unresolved. The selected set is the deduplicated, ascending union
 * across operands, so resolution is independent of operand order and repetition.
 */
export function resolveTargetedTestFiles(
  discovered: readonly string[],
  selection: TargetSelection,
  context: OperandResolutionContext,
): TargetResolution {
  const selected = new Set<string>();
  const unresolved: string[] = [];
  for (const operand of selection.operands) {
    const matches = matchOperand(discovered, operand, selection.recursive, context.productDir);
    if (matches.length === 0) {
      unresolved.push(operand);
      continue;
    }
    for (const match of matches) selected.add(match);
  }
  return { selected: [...selected].sort(compareAsciiStrings), unresolved };
}
