import { posix } from "node:path";

import { GIT_ROOT_COMMAND, type GitDependencies } from "@/lib/git/root";
import { SPEC_TREE_CONFIG, SPEC_TREE_GRAMMAR, SPEC_TREE_NODE_STATE } from "@/lib/spec-tree";
import { compareAsciiStrings } from "@/lib/state-store";

import {
  NODE_STATUS_CLAIM_FIELD,
  NODE_STATUS_CLAIM_SECTION,
  NODE_STATUS_MALLEABILITY,
  type NodeStatusActor,
  type NodeStatusClaim,
  type NodeStatusClaimEntry,
  type NodeStatusClaimSection,
  type NodeStatusClaimVerification,
} from "./claim";
import { type ClaimHistoryReader, classifyNodeClaim, governingDeclarationPaths } from "./claim-state";
import { NODE_STATUS_EVIDENCE_OUTCOME, type NodeStatusEvidenceOutcome } from "./classify";
import { NODE_STATUS_CURRENCY, type PinChangeReader, resultCurrency } from "./currency";
import { NODE_STATUS_FILENAME } from "./read";
import type { NodeSpecDeclaration } from "./spec-declaration";

const PATH_SEPARATOR = SPEC_TREE_GRAMMAR.PATH_SEPARATOR;
const ROOT_PREFIX = `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}${PATH_SEPARATOR}`;
const GIT_REV_PARSE = "rev-parse";
const GIT_HEAD = "HEAD";
const GIT_SUCCESS = 0;

/** Who produced a result and in which run. */
export interface NodeAttribution {
  readonly actor: NodeStatusActor;
  readonly run: string;
}

/** A result an Agentic or Attested run produced, with the paths it read. */
export interface NodeAttributedResult extends NodeAttribution {
  readonly verdict: NodeStatusEvidenceOutcome;
  readonly read: readonly string[];
}

/** What the audit and evidence results a node's claim requires are asked for, and what recorded runs answer. */
export interface NodeAttributedRequest {
  readonly auditRuleSlugs: readonly string[];
  readonly evidenceKinds: readonly string[];
}

export type NodeAttributedResults = Readonly<{
  audit?: Readonly<Record<string, NodeAttributedResult>>;
  evidence?: Readonly<Record<string, NodeAttributedResult>>;
}>;

/** Resolves the paths a linked reference's recorded result read; `undefined` when its adapter reports none. */
export type NodeReadPathResolver = (
  nodeId: string,
  evidencePath: string,
  outcome: NodeStatusEvidenceOutcome,
) => Promise<readonly string[] | undefined>;

/** Resolves the audit and evidence results sealed audit runs recorded for a node. */
export type NodeAttributedResultResolver = (
  nodeId: string,
  request: NodeAttributedRequest,
) => Promise<NodeAttributedResults>;

export interface NodeClaimFoldInput {
  readonly productDir: string;
  readonly nodeId: string;
  readonly declaration: NodeSpecDeclaration;
  /** Product-relative paths of the node's linked evidence. */
  readonly evidencePaths: readonly string[];
  /** The per-reference outcomes recorded runs produced; an omitted reference is covered but stale. */
  readonly outcomes: Readonly<Partial<Record<string, NodeStatusEvidenceOutcome>>>;
  readonly committed: NodeStatusClaimVerification;
  readonly git: GitDependencies;
  readonly trackedPaths: ReadonlySet<string>;
  readonly pinChanges: PinChangeReader;
  readonly history: ClaimHistoryReader;
  readonly resolveReadPaths?: NodeReadPathResolver;
  readonly resolveAttributedResults?: NodeAttributedResultResolver;
}

/**
 * Fold the results recorded runs produced over the node's committed entries into the 4.0 claim the node
 * writes: a committed entry whose pin is current and whose verdict and read set equal the run's stays as
 * committed; a covered reference whose evidence is stale keeps its committed entry, or reads `not-run` with
 * no pin when none is committed; a reference no run covers reads `not-run` with no pin.
 */
export async function foldNodeClaim(input: NodeClaimFoldInput): Promise<NodeStatusClaim> {
  const head = await headCommit(input.git, input.productDir);
  const nodePath = `${ROOT_PREFIX}${input.nodeId}`;
  const sections: Partial<Record<NodeStatusClaimSection, Record<string, NodeStatusClaimEntry>>> = {};
  const place = (section: NodeStatusClaimSection, key: string, entry: NodeStatusClaimEntry): void => {
    (sections[section] ??= {})[key] = entry;
  };
  const fold = (section: NodeStatusClaimSection, key: string, candidate: PinCandidate | undefined, stale: boolean) =>
    foldEntry({ section, committed: input.committed[section]?.[key], candidate, stale, head, input });

  for (const evidencePath of [...input.evidencePaths].sort(compareAsciiStrings)) {
    const section = sectionOfEvidence(evidencePath);
    const key = posix.relative(nodePath, evidencePath);
    const outcome = input.outcomes[evidencePath];
    const read = outcome === undefined || outcome === NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN
      ? undefined
      : await input.resolveReadPaths?.(input.nodeId, evidencePath, outcome);
    place(
      section,
      key,
      await fold(
        section,
        key,
        candidateOf(outcome, read, [input.declaration.specPath, evidencePath]),
        outcome === undefined,
      ),
    );
  }

  const evidenceKinds = input.declaration.malleability === NODE_STATUS_MALLEABILITY.IMPLEMENTATION
    ? linkedEvidenceKinds(input.evidencePaths)
    : [];
  const attributed = input.resolveAttributedResults === undefined
      || (input.declaration.auditRuleSlugs.length === 0 && evidenceKinds.length === 0)
    ? {}
    : await input.resolveAttributedResults(input.nodeId, {
      auditRuleSlugs: input.declaration.auditRuleSlugs,
      evidenceKinds,
    });
  const attributedRequirements: readonly [NodeStatusClaimSection, readonly string[]][] = [
    [NODE_STATUS_CLAIM_SECTION.AUDIT, input.declaration.auditRuleSlugs],
    [NODE_STATUS_CLAIM_SECTION.EVIDENCE, evidenceKinds],
  ];
  for (const [section, keys] of attributedRequirements) {
    const recorded = section === NODE_STATUS_CLAIM_SECTION.AUDIT ? attributed.audit : attributed.evidence;
    for (const key of keys) {
      const result = recorded?.[key];
      const candidate = result === undefined
        ? undefined
        : candidateOf(result.verdict, result.read, [input.declaration.specPath], result);
      place(section, key, await fold(section, key, candidate, false));
    }
  }

  const verification = sortedVerification(sections);
  const results = await Promise.all(
    Object.entries(verification).flatMap(([section, entries]) =>
      Object.values(entries).map(async (entry) => ({
        verdict: entry[NODE_STATUS_CLAIM_FIELD.VERDICT],
        currency: await resultCurrency(section as NodeStatusClaimSection, entry, input.pinChanges),
      }))
    ),
  );
  const facts = {
    requiredArtifactsMissing: input.evidencePaths.length === 0,
    results,
  };
  let state = classifyNodeClaim({ ...facts, recordedPassingAtOrAfterDeclaration: false });
  if (state !== SPEC_TREE_NODE_STATE.PASSING) {
    state = classifyNodeClaim({
      ...facts,
      recordedPassingAtOrAfterDeclaration: await input.history.recordedPassingAtOrAfterDeclaration(
        `${nodePath}${PATH_SEPARATOR}${NODE_STATUS_FILENAME}`,
        governingDeclarationPaths(nodePath, input.declaration.specPath, input.trackedPaths),
      ),
    });
  }
  return {
    [NODE_STATUS_CLAIM_FIELD.STATE]: state,
    [NODE_STATUS_CLAIM_FIELD.MALLEABILITY]: input.declaration.malleability,
    [NODE_STATUS_CLAIM_FIELD.VERIFICATION]: verification,
  };
}

type PinCandidate = {
  readonly verdict: NodeStatusEvidenceOutcome;
  readonly read: readonly string[];
  readonly attribution?: NodeAttribution;
};

/** A passed or failed result with the paths it read, plus the declaration and artifact the fold always adds. */
function candidateOf(
  verdict: NodeStatusEvidenceOutcome | undefined,
  reported: readonly string[] | undefined,
  declared: readonly string[],
  attribution?: NodeAttribution,
): PinCandidate | undefined {
  if (verdict === undefined || verdict === NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN) return undefined;
  const subject = (reported ?? []).filter((path) => !declared.includes(path));
  if (subject.length === 0) return undefined;
  return {
    verdict,
    read: [...new Set([...declared, ...subject])].sort(compareAsciiStrings),
    ...(attribution === undefined ? {} : { attribution }),
  };
}

type FoldEntryInput = {
  readonly section: NodeStatusClaimSection;
  readonly committed: NodeStatusClaimEntry | undefined;
  readonly candidate: PinCandidate | undefined;
  readonly stale: boolean;
  readonly head: string | undefined;
  readonly input: NodeClaimFoldInput;
};

async function foldEntry(
  { section, committed, candidate, stale, head, input }: FoldEntryInput,
): Promise<NodeStatusClaimEntry> {
  const notRun: NodeStatusClaimEntry = { [NODE_STATUS_CLAIM_FIELD.VERDICT]: NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN };
  if (stale) return committed ?? notRun;
  if (candidate === undefined || head === undefined) return notRun;
  const changed = await input.pinChanges.changedPaths(head);
  if (changed === undefined || candidate.read.some((path) => changed.has(path))) return notRun;
  if (
    committed !== undefined
    && committed[NODE_STATUS_CLAIM_FIELD.VERDICT] === candidate.verdict
    && sameSet(committed[NODE_STATUS_CLAIM_FIELD.READ], candidate.read)
    && await resultCurrency(section, committed, input.pinChanges) === NODE_STATUS_CURRENCY.CURRENT
  ) {
    return committed;
  }
  return {
    [NODE_STATUS_CLAIM_FIELD.VERDICT]: candidate.verdict,
    [NODE_STATUS_CLAIM_FIELD.COMMIT]: head,
    [NODE_STATUS_CLAIM_FIELD.READ]: candidate.read,
    ...(candidate.attribution === undefined
      ? {}
      : {
        [NODE_STATUS_CLAIM_FIELD.ACTOR]: candidate.attribution.actor,
        [NODE_STATUS_CLAIM_FIELD.RUN]: candidate.attribution.run,
      }),
  };
}

function sameSet(left: readonly string[] | undefined, right: readonly string[]): boolean {
  return left !== undefined && left.length === right.length && right.every((path) => left.includes(path));
}

async function headCommit(git: GitDependencies, productDir: string): Promise<string | undefined> {
  try {
    const result = await git.execa(GIT_ROOT_COMMAND.EXECUTABLE, [GIT_REV_PARSE, GIT_HEAD], {
      cwd: productDir,
      reject: false,
    });
    return result.exitCode === GIT_SUCCESS && result.stdout.length > 0 ? result.stdout : undefined;
  } catch {
    return undefined;
  }
}

function sectionOfEvidence(evidencePath: string): NodeStatusClaimSection {
  const segments = evidencePath.split(PATH_SEPARATOR);
  if (segments.includes(SPEC_TREE_GRAMMAR.EVAL.DIRECTORY_NAME)) return NODE_STATUS_CLAIM_SECTION.EVAL;
  if (segments.includes(SPEC_TREE_GRAMMAR.PROBE.DIRECTORY_NAME)) return NODE_STATUS_CLAIM_SECTION.PROBE;
  return NODE_STATUS_CLAIM_SECTION.TEST;
}

/** The kinds of linked evidence a node's `evidence` results are keyed by. */
function linkedEvidenceKinds(evidencePaths: readonly string[]): readonly string[] {
  const kinds = new Set<string>();
  for (const path of evidencePaths) {
    const section = sectionOfEvidence(path);
    if (section === NODE_STATUS_CLAIM_SECTION.TEST || section === NODE_STATUS_CLAIM_SECTION.EVAL) kinds.add(section);
  }
  return [...kinds].sort(compareAsciiStrings);
}

function sortedVerification(
  sections: Partial<Record<NodeStatusClaimSection, Record<string, NodeStatusClaimEntry>>>,
): NodeStatusClaimVerification {
  const sorted: Partial<Record<NodeStatusClaimSection, Record<string, NodeStatusClaimEntry>>> = {};
  for (const section of Object.values(NODE_STATUS_CLAIM_SECTION)) {
    const entries = sections[section];
    if (entries === undefined) continue;
    sorted[section] = Object.fromEntries(
      Object.entries(entries).sort(([left], [right]) => compareAsciiStrings(left, right)),
    );
  }
  return sorted;
}
