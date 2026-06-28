import { CONFIG_FILENAMES } from "@/config/filenames";
import { TEST_RELEVANT_SOURCE_ROOT_PREFIXES } from "@/config/source-roots";
import { SPEC_TREE_EVIDENCE_FILE } from "@/lib/spec-tree";
import { KIND_REGISTRY, SPEC_TREE_CONFIG } from "@/lib/spec-tree/config";
import { compareAsciiStrings } from "@/lib/state-store";

const PATH_SEPARATOR = "/";
const MARKDOWN_EXTENSION = ".md";
const NODE_INDEX_PATTERN = /^[0-9]+-/;
const TESTS_DIRECTORY_NAME = SPEC_TREE_EVIDENCE_FILE.DIRECTORY_NAME;
const SPEC_ROOT = SPEC_TREE_CONFIG.ROOT_DIRECTORY;
const NODE_SUFFIXES = [KIND_REGISTRY.enabler.suffix, KIND_REGISTRY.outcome.suffix] as const;
const CONFIG_FILE_PATHS = new Set<string>(Object.values(CONFIG_FILENAMES));

/** Changed paths partitioned into target operands and source files needing adapter resolution. */
export interface ChangedPathPartition {
  /** Product-root-relative operands that can feed targeted execution directly. */
  readonly operands: readonly string[];
  /** Changed source files that require a registered related-test capability. */
  readonly sourceFiles: readonly string[];
  /** Whether changed paths include product config, which affects test selection globally. */
  readonly configChanged: boolean;
}

function isNodeSegment(segment: string): boolean {
  return NODE_INDEX_PATTERN.test(segment) && NODE_SUFFIXES.some((suffix) => segment.endsWith(suffix));
}

function nodeSpecSlug(segment: string): string | null {
  const suffix = NODE_SUFFIXES.find((candidate) => segment.endsWith(candidate));
  if (suffix === undefined) return null;
  return segment.replace(NODE_INDEX_PATTERN, "").slice(0, -suffix.length);
}

function nearestNodeOperand(path: string): string | null {
  const segments = path.split(PATH_SEPARATOR);
  if (segments[0] !== SPEC_ROOT) return null;
  let nodeEnd = -1;
  for (const [index, segment] of segments.entries()) {
    if (isNodeSegment(segment)) nodeEnd = index;
  }
  if (nodeEnd < 0) return null;
  const nodeSegments = segments.slice(0, nodeEnd + 1);
  const tail = segments.slice(nodeEnd + 1);
  const nodeSlug = nodeSpecSlug(segments[nodeEnd]);
  const isNodeSpec = tail.length === 1 && nodeSlug !== null && tail[0] === `${nodeSlug}${MARKDOWN_EXTENSION}`;
  const isNodeTest = tail[0] === TESTS_DIRECTORY_NAME && tail.length > 1;
  return isNodeSpec || isNodeTest ? nodeSegments.join(PATH_SEPARATOR) : null;
}

/**
 * Partitions changed paths into target operands selected by pure spec-tree path
 * math and source files that need related-test resolution from language adapters.
 */
export function partitionChangedPaths(changedPaths: readonly string[]): ChangedPathPartition {
  const operands = new Set<string>();
  const sourceFiles = new Set<string>();
  let configChanged = false;

  for (const path of changedPaths) {
    if (CONFIG_FILE_PATHS.has(path)) {
      configChanged = true;
      continue;
    }
    const operand = nearestNodeOperand(path);
    if (operand !== null) {
      operands.add(operand);
      continue;
    }
    if (TEST_RELEVANT_SOURCE_ROOT_PREFIXES.some((prefix) => path.startsWith(prefix))) {
      sourceFiles.add(path);
    }
  }

  return {
    operands: [...operands].sort(compareAsciiStrings),
    sourceFiles: [...sourceFiles].sort(compareAsciiStrings),
    configChanged,
  };
}

/** Deduplicates path-selected operands and adapter-derived related test paths. */
export function mergeChangedSetOperands(
  pathOperands: readonly string[],
  relatedTestPaths: readonly string[],
): readonly string[] {
  return [...new Set([...pathOperands, ...relatedTestPaths])].sort(compareAsciiStrings);
}
