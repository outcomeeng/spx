import { posix } from "node:path";

import { committedFileContent } from "@/lib/git/release";
import { GIT_ROOT_COMMAND, type GitDependencies } from "@/lib/git/root";
import { DECISION_SUFFIXES, SPEC_TREE_GRAMMAR, SPEC_TREE_NODE_STATE, type SpecTreeNodeState } from "@/lib/spec-tree";
import { compareAsciiStrings } from "@/lib/state-store";

import { NODE_STATUS_CLAIM_FIELD, NODE_STATUS_CLAIM_SHAPE } from "./claim";
import { NODE_STATUS_EVIDENCE_OUTCOME, type NodeStatusEvidenceOutcome } from "./classify";
import { NODE_STATUS_CURRENCY, type NodeStatusCurrency } from "./currency";
import { parseNodeStatusFile } from "./read";

/** One required result as the classifier sees it: its verdict and whether its pin holds. */
export interface NodeStatusResultFact {
  readonly verdict: NodeStatusEvidenceOutcome;
  readonly currency: NodeStatusCurrency;
}

/** The observable facts that determine the lifecycle state of a node measured against a 4.0 claim. */
export interface NodeClaimClassificationFacts {
  /** Whether a verification artifact the node's malleability requires is missing. */
  readonly requiredArtifactsMissing: boolean;
  readonly results: readonly NodeStatusResultFact[];
  /** Whether the node's claim recorded `passing` at or after the latest change to its spec or a governing decision. */
  readonly recordedPassingAtOrAfterDeclaration: boolean;
}

/**
 * Resolve a node's lifecycle state from a 4.0 claim's facts: `passing` when every required
 * result is current and passed; otherwise `failing` when the claim recorded `passing` at or after the latest
 * declaration change; otherwise `declared` when a required artifact is missing; otherwise `specified`.
 */
export function classifyNodeClaim(facts: NodeClaimClassificationFacts): SpecTreeNodeState {
  const everyResultHolds = facts.results.every(
    (result) =>
      result.verdict === NODE_STATUS_EVIDENCE_OUTCOME.PASSED && result.currency === NODE_STATUS_CURRENCY.CURRENT,
  );
  if (!facts.requiredArtifactsMissing && facts.results.length > 0 && everyResultHolds) {
    return SPEC_TREE_NODE_STATE.PASSING;
  }
  if (facts.recordedPassingAtOrAfterDeclaration) return SPEC_TREE_NODE_STATE.FAILING;
  if (facts.requiredArtifactsMissing) return SPEC_TREE_NODE_STATE.DECLARED;
  return SPEC_TREE_NODE_STATE.SPECIFIED;
}

/**
 * Resolve a parent's lifecycle state from the states of its variants: `passing` only when every variant passes;
 * otherwise the least advanced standing among them, `failing` before `specified` before `declared`.
 */
export function classifyParentOfVariants(variantStates: readonly SpecTreeNodeState[]): SpecTreeNodeState {
  if (variantStates.length > 0 && variantStates.every((state) => state === SPEC_TREE_NODE_STATE.PASSING)) {
    return SPEC_TREE_NODE_STATE.PASSING;
  }
  if (variantStates.includes(SPEC_TREE_NODE_STATE.FAILING)) return SPEC_TREE_NODE_STATE.FAILING;
  if (variantStates.includes(SPEC_TREE_NODE_STATE.SPECIFIED)) return SPEC_TREE_NODE_STATE.SPECIFIED;
  return SPEC_TREE_NODE_STATE.DECLARED;
}

const ORDER_PREFIX = /^(\d+(?:\.\d+)?)-/;

/**
 * The paths whose change invalidates a node's declaration: its spec and every decision record that governs it —
 * the records beside it and its ancestors, and the lower-index records beside each ancestor on the way down.
 */
export function governingDeclarationPaths(
  nodePath: string,
  specPath: string,
  trackedPaths: ReadonlySet<string>,
): readonly string[] {
  const segments = nodePath.split(SPEC_TREE_GRAMMAR.PATH_SEPARATOR);
  const paths = new Set<string>([specPath]);
  for (let depth = 1; depth <= segments.length; depth += 1) {
    const directory = segments.slice(0, depth).join(SPEC_TREE_GRAMMAR.PATH_SEPARATOR);
    const towardTarget = segments.at(depth);
    const limit = towardTarget === undefined ? Number.POSITIVE_INFINITY : orderOf(towardTarget);
    for (const tracked of trackedPaths) {
      if (posix.dirname(tracked) !== directory || !isDecisionFile(tracked)) continue;
      if (orderOf(posix.basename(tracked)) < limit) paths.add(tracked);
    }
  }
  return [...paths].sort(compareAsciiStrings);
}

function orderOf(name: string): number {
  const prefix = ORDER_PREFIX.exec(name)?.[1];
  return prefix === undefined ? Number.NEGATIVE_INFINITY : Number(prefix);
}

function isDecisionFile(path: string): boolean {
  return DECISION_SUFFIXES.some((suffix) => path.endsWith(suffix));
}

const GIT_LOG = "log";
const GIT_LOG_FORMAT_HASH = "--format=%H";
const GIT_LOG_SINGLE_ENTRY = "-1";
const GIT_PATH_SEPARATOR_ARG = "--";
const GIT_MERGE_BASE = "merge-base";
const GIT_IS_ANCESTOR_FLAG = "--is-ancestor";
const GIT_SUCCESS = 0;

export interface ClaimHistoryReaderOptions {
  readonly productDir: string;
  readonly git: GitDependencies;
}

/** Reads, from git history, whether a node's claim recorded `passing` at or after its latest declaration change. */
export interface ClaimHistoryReader {
  recordedPassingAtOrAfterDeclaration(claimPath: string, declarationPaths: readonly string[]): Promise<boolean>;
}

export function createClaimHistoryReader(options: ClaimHistoryReaderOptions): ClaimHistoryReader {
  const run = async (args: readonly string[]) =>
    options.git.execa(GIT_ROOT_COMMAND.EXECUTABLE, [...args], { cwd: options.productDir, reject: false });
  const commitsTouching = async (paths: readonly string[], limit: readonly string[]): Promise<readonly string[]> => {
    const result = await run([GIT_LOG, GIT_LOG_FORMAT_HASH, ...limit, GIT_PATH_SEPARATOR_ARG, ...paths]);
    return result.exitCode === GIT_SUCCESS ? result.stdout.split("\n").filter((line) => line.length > 0) : [];
  };
  const isAtOrAfter = async (boundary: string, commit: string): Promise<boolean> => {
    if (boundary === commit) return true;
    return (await run([GIT_MERGE_BASE, GIT_IS_ANCESTOR_FLAG, boundary, commit])).exitCode === GIT_SUCCESS;
  };
  return {
    async recordedPassingAtOrAfterDeclaration(claimPath, declarationPaths) {
      const boundary = (await commitsTouching(declarationPaths, [GIT_LOG_SINGLE_ENTRY])).at(0);
      for (const commit of await commitsTouching([claimPath], [])) {
        if (boundary !== undefined && !(await isAtOrAfter(boundary, commit))) return false;
        const content = await committedFileContent(commit, claimPath, options.productDir, options.git);
        if (content !== null && recordsPassing(content, claimPath)) return true;
      }
      return false;
    },
  };
}

function recordsPassing(content: string, source: string): boolean {
  try {
    const read = parseNodeStatusFile(JSON.parse(content), source);
    return read.shape === NODE_STATUS_CLAIM_SHAPE.CURRENT
      && read.claim[NODE_STATUS_CLAIM_FIELD.STATE] === SPEC_TREE_NODE_STATE.PASSING;
  } catch {
    return false;
  }
}
