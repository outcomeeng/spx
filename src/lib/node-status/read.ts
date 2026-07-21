import { readFileSync } from "node:fs";
import { join } from "node:path";

import { SPEC_TREE_GRAMMAR } from "@/lib/spec-tree";

import {
  NODE_STATUS_EVIDENCE_OUTCOME,
  NODE_STATUS_FIELD,
  NODE_STATUS_MECHANISM_OVERALL,
  NODE_STATUS_SCHEMA_VERSION,
  NODE_STATUS_VERIFICATION_MECHANISM,
  type NodeStatusEvidenceOutcome,
  type NodeStatusFile,
  type NodeStatusMechanismOverall,
  type NodeStatusMechanismRecord,
  type NodeStatusVerification,
  type NodeStatusVerificationMechanism,
  rollupNodeStatusMechanism,
} from "./classify";

/** Filename of the co-located per-node verification projection. */
export const NODE_STATUS_FILENAME = SPEC_TREE_GRAMMAR.STATUS_FILENAME;

const NODE_STATUS_MECHANISMS: ReadonlySet<string> = new Set(Object.values(NODE_STATUS_VERIFICATION_MECHANISM));
const NODE_STATUS_EVIDENCE_OUTCOMES: ReadonlySet<string> = new Set(Object.values(NODE_STATUS_EVIDENCE_OUTCOME));
const NODE_STATUS_OVERALL_VALUES: ReadonlySet<string> = new Set(Object.values(NODE_STATUS_MECHANISM_OVERALL));

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeStatusMechanism(value: string): value is NodeStatusVerificationMechanism {
  return NODE_STATUS_MECHANISMS.has(value);
}

function isNodeStatusEvidenceOutcome(value: unknown): value is NodeStatusEvidenceOutcome {
  return typeof value === "string" && NODE_STATUS_EVIDENCE_OUTCOMES.has(value);
}

function isNodeStatusMechanismOverall(value: unknown): value is NodeStatusMechanismOverall {
  return typeof value === "string" && NODE_STATUS_OVERALL_VALUES.has(value);
}

export function readNodeStatus(nodeDir: string): NodeStatusFile | undefined {
  const filePath = join(nodeDir, NODE_STATUS_FILENAME);

  let content: string;
  try {
    content = readFileSync(filePath, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }

  return parseNodeStatusFile(JSON.parse(content), filePath);
}

export function parseNodeStatusFile(candidate: unknown, source: string): NodeStatusFile {
  if (!isObject(candidate)) {
    throw new Error(`Invalid ${NODE_STATUS_FILENAME} at ${source}: expected a JSON object`);
  }
  if (candidate[NODE_STATUS_FIELD.SCHEMA_VERSION] !== NODE_STATUS_SCHEMA_VERSION) {
    throw new Error(
      `Invalid ${NODE_STATUS_FILENAME} at ${source}: schemaVersion must be ${NODE_STATUS_SCHEMA_VERSION}`,
    );
  }
  const verification = parseVerification(candidate[NODE_STATUS_FIELD.VERIFICATION], source);
  return {
    [NODE_STATUS_FIELD.SCHEMA_VERSION]: NODE_STATUS_SCHEMA_VERSION,
    [NODE_STATUS_FIELD.VERIFICATION]: verification,
  };
}

function parseVerification(candidate: unknown, source: string): NodeStatusVerification {
  if (!isObject(candidate)) {
    throw new Error(`Invalid ${NODE_STATUS_FILENAME} at ${source}: verification must be an object`);
  }
  const verification: Partial<Record<NodeStatusVerificationMechanism, NodeStatusMechanismRecord>> = {};
  for (const [mechanism, rawRecord] of Object.entries(candidate)) {
    if (!isNodeStatusMechanism(mechanism)) {
      throw new Error(`Invalid ${NODE_STATUS_FILENAME} at ${source}: unknown verification mechanism "${mechanism}"`);
    }
    verification[mechanism] = parseMechanismRecord(rawRecord, source, mechanism);
  }
  return verification;
}

function parseMechanismRecord(
  candidate: unknown,
  source: string,
  mechanism: NodeStatusVerificationMechanism,
): NodeStatusMechanismRecord {
  if (!isObject(candidate)) {
    throw new Error(`Invalid ${NODE_STATUS_FILENAME} at ${source}: verification.${mechanism} must be an object`);
  }
  const overall = candidate[NODE_STATUS_FIELD.OVERALL];
  if (!isNodeStatusMechanismOverall(overall)) {
    throw new Error(
      `Invalid ${NODE_STATUS_FILENAME} at ${source}: verification.${mechanism}.overall is invalid`,
    );
  }
  const parsed: Record<string, NodeStatusEvidenceOutcome | NodeStatusMechanismOverall> = {
    [NODE_STATUS_FIELD.OVERALL]: overall,
  };
  const outcomes: Record<string, NodeStatusEvidenceOutcome> = {};
  for (const [reference, outcome] of Object.entries(candidate)) {
    if (reference === NODE_STATUS_FIELD.OVERALL) continue;
    if (!isNodeStatusEvidenceOutcome(outcome)) {
      throw new Error(
        `Invalid ${NODE_STATUS_FILENAME} at ${source}: verification.${mechanism}.${reference} is invalid`,
      );
    }
    outcomes[reference] = outcome;
    parsed[reference] = outcome;
  }
  const expectedOverall = rollupNodeStatusMechanism(outcomes);
  if (overall !== expectedOverall) {
    throw new Error(
      `Invalid ${NODE_STATUS_FILENAME} at ${source}: verification.${mechanism}.overall does not match evidence outcomes`,
    );
  }
  return parsed as NodeStatusMechanismRecord;
}
