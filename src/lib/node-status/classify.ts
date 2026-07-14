import { SPEC_TREE_NODE_STATE, type SpecTreeNodeState } from "@/lib/spec-tree";

/**
 * The observable facts that determine a spec-tree node's lifecycle state.
 *
 * - `hasVerificationReferences` — the node declares linked verification evidence.
 * - `isExcluded` — the node path is listed in `spx/EXCLUDE`.
 * - `verification` — the node's persisted runtime verification outcomes.
 */
export interface NodeClassificationFacts {
  readonly hasVerificationReferences: boolean;
  readonly isExcluded: boolean;
  readonly verification?: NodeStatusVerification;
}

export const NODE_STATUS_SCHEMA_VERSION = 1;

const NODE_STATUS_JSON_INDENT = 2;

export const NODE_STATUS_FIELD = {
  SCHEMA_VERSION: "schemaVersion",
  VERIFICATION: "verification",
  OVERALL: "overall",
} as const;

export const NODE_STATUS_VERIFICATION_MECHANISM = {
  TEST: "test",
  EVAL: "eval",
  AUDIT: "audit",
} as const;

export const NODE_STATUS_EVIDENCE_OUTCOME = {
  PASSED: "passed",
  FAILED: "failed",
  NOT_RUN: "not-run",
} as const;

export const NODE_STATUS_MECHANISM_OVERALL = {
  PASSED: NODE_STATUS_EVIDENCE_OUTCOME.PASSED,
  FAILED: NODE_STATUS_EVIDENCE_OUTCOME.FAILED,
  PARTIAL: "partial",
  NOT_RUN: NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN,
} as const;

export type NodeStatusVerificationMechanism =
  (typeof NODE_STATUS_VERIFICATION_MECHANISM)[keyof typeof NODE_STATUS_VERIFICATION_MECHANISM];
export type NodeStatusEvidenceOutcome =
  (typeof NODE_STATUS_EVIDENCE_OUTCOME)[keyof typeof NODE_STATUS_EVIDENCE_OUTCOME];
export type NodeStatusMechanismOverall =
  (typeof NODE_STATUS_MECHANISM_OVERALL)[keyof typeof NODE_STATUS_MECHANISM_OVERALL];

export type NodeStatusMechanismRecord = Readonly<
  & { [NODE_STATUS_FIELD.OVERALL]: NodeStatusMechanismOverall }
  & Record<string, NodeStatusEvidenceOutcome | NodeStatusMechanismOverall>
>;

export type NodeStatusVerification = Readonly<
  Partial<Record<NodeStatusVerificationMechanism, NodeStatusMechanismRecord>>
>;

export interface NodeStatusFile {
  readonly [NODE_STATUS_FIELD.SCHEMA_VERSION]: typeof NODE_STATUS_SCHEMA_VERSION;
  readonly [NODE_STATUS_FIELD.VERIFICATION]: NodeStatusVerification;
}

/**
 * Resolve a node's lifecycle state from its classification facts.
 *
 * Precedence (declared in `node-status.md`): a node with no linked verification
 * references is `declared`; otherwise a node listed in `spx/EXCLUDE` is
 * `specified`; otherwise a node whose persisted verification outcomes all pass
 * is `passing`; otherwise the node is `failing`.
 */
export function classifyNodeStatus(facts: NodeClassificationFacts): SpecTreeNodeState {
  if (!facts.hasVerificationReferences) return SPEC_TREE_NODE_STATE.DECLARED;
  if (facts.isExcluded) return SPEC_TREE_NODE_STATE.SPECIFIED;
  if (verificationPassed(facts.verification)) return SPEC_TREE_NODE_STATE.PASSING;
  return SPEC_TREE_NODE_STATE.FAILING;
}

export function createNodeStatusFile(verification: NodeStatusVerification): NodeStatusFile {
  return {
    [NODE_STATUS_FIELD.SCHEMA_VERSION]: NODE_STATUS_SCHEMA_VERSION,
    [NODE_STATUS_FIELD.VERIFICATION]: verification,
  };
}

export function hasNodeStatusVerificationReferences(verification: NodeStatusVerification): boolean {
  return Object.values(verification).some((mechanism) =>
    Object.keys(mechanism).some((reference) => reference !== NODE_STATUS_FIELD.OVERALL)
  );
}

export function createNodeStatusMechanismRecord(
  outcomes: Readonly<Record<string, NodeStatusEvidenceOutcome>>,
): NodeStatusMechanismRecord {
  return {
    [NODE_STATUS_FIELD.OVERALL]: rollupNodeStatusMechanism(outcomes),
    ...outcomes,
  };
}

export function rollupNodeStatusMechanism(
  outcomes: Readonly<Record<string, NodeStatusEvidenceOutcome>>,
): NodeStatusMechanismOverall {
  const values = Object.values(outcomes);
  if (values.length === 0) return NODE_STATUS_MECHANISM_OVERALL.NOT_RUN;
  if (values.includes(NODE_STATUS_EVIDENCE_OUTCOME.FAILED)) {
    return NODE_STATUS_MECHANISM_OVERALL.FAILED;
  }
  if (values.every((outcome) => outcome === NODE_STATUS_EVIDENCE_OUTCOME.PASSED)) {
    return NODE_STATUS_MECHANISM_OVERALL.PASSED;
  }
  if (values.every((outcome) => outcome === NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN)) {
    return NODE_STATUS_MECHANISM_OVERALL.NOT_RUN;
  }
  return NODE_STATUS_MECHANISM_OVERALL.PARTIAL;
}

/** Serialize a verification projection to the canonical `spx.status.json` document. */
export function serializeNodeStatus(status: NodeStatusFile): string {
  return `${JSON.stringify(status, null, NODE_STATUS_JSON_INDENT)}\n`;
}

function verificationPassed(verification: NodeStatusVerification | undefined): boolean {
  if (verification === undefined) return false;
  const mechanisms = Object.values(verification);
  return mechanisms.length > 0
    && mechanisms.every((mechanism) => mechanism[NODE_STATUS_FIELD.OVERALL] === NODE_STATUS_MECHANISM_OVERALL.PASSED);
}
