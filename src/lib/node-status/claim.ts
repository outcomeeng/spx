import { SPEC_TREE_NODE_STATE, type SpecTreeNodeState } from "@/lib/spec-tree";

import { NODE_STATUS_EVIDENCE_OUTCOME, type NodeStatusEvidenceOutcome } from "./classify";

const NODE_STATUS_CLAIM_JSON_INDENT = 2;

/** The two claim shapes `spx.status.json` is read in; the writer produces the shape of the declared methodology. */
export const NODE_STATUS_CLAIM_SHAPE = {
  VERSION_1: "version-1",
  CURRENT: "4.0",
} as const;

export type NodeStatusClaimShape = (typeof NODE_STATUS_CLAIM_SHAPE)[keyof typeof NODE_STATUS_CLAIM_SHAPE];

/** The malleability layers a node declares; the absent declaration means the implementation layer. */
export const NODE_STATUS_MALLEABILITY = {
  SPEC: "spec",
  VERIFICATION: "verification",
  IMPLEMENTATION: "implementation",
} as const;

export type NodeStatusMalleability = (typeof NODE_STATUS_MALLEABILITY)[keyof typeof NODE_STATUS_MALLEABILITY];

export const NODE_STATUS_DEFAULT_MALLEABILITY = NODE_STATUS_MALLEABILITY.IMPLEMENTATION;

/** The field names of a 4.0 claim and of each result entry in it. */
export const NODE_STATUS_CLAIM_FIELD = {
  STATE: "state",
  MALLEABILITY: "malleability",
  VERIFICATION: "verification",
  VERDICT: "verdict",
  COMMIT: "commit",
  READ: "read",
  ACTOR: "actor",
  RUN: "run",
  ACTOR_KIND: "kind",
  ACTOR_ID: "id",
} as const;

/** The result groups of a 4.0 claim, keyed by tagged path (audit by rule slug, evidence by evidence kind). */
export const NODE_STATUS_CLAIM_SECTION = {
  TEST: "test",
  EVAL: "eval",
  PROBE: "probe",
  AUDIT: "audit",
  EVIDENCE: "evidence",
} as const;

export type NodeStatusClaimSection = (typeof NODE_STATUS_CLAIM_SECTION)[keyof typeof NODE_STATUS_CLAIM_SECTION];

/** The sections whose entries come from an Agentic or Attested run and so carry an actor and a run. */
export const NODE_STATUS_ATTRIBUTED_SECTIONS: ReadonlySet<NodeStatusClaimSection> = new Set([
  NODE_STATUS_CLAIM_SECTION.PROBE,
  NODE_STATUS_CLAIM_SECTION.AUDIT,
  NODE_STATUS_CLAIM_SECTION.EVIDENCE,
]);

export const NODE_STATUS_ACTOR_KIND = {
  PERSON: "person",
  AGENT: "agent",
} as const;

export type NodeStatusActorKind = (typeof NODE_STATUS_ACTOR_KIND)[keyof typeof NODE_STATUS_ACTOR_KIND];

export interface NodeStatusActor {
  readonly [NODE_STATUS_CLAIM_FIELD.ACTOR_KIND]: NodeStatusActorKind;
  readonly [NODE_STATUS_CLAIM_FIELD.ACTOR_ID]: string;
}

/** One result: its verdict, and for a passed or failed result the pin (commit and read paths) it was produced under. */
export interface NodeStatusClaimEntry {
  readonly [NODE_STATUS_CLAIM_FIELD.VERDICT]: NodeStatusEvidenceOutcome;
  readonly [NODE_STATUS_CLAIM_FIELD.COMMIT]?: string;
  readonly [NODE_STATUS_CLAIM_FIELD.READ]?: readonly string[];
  readonly [NODE_STATUS_CLAIM_FIELD.ACTOR]?: NodeStatusActor;
  readonly [NODE_STATUS_CLAIM_FIELD.RUN]?: string;
}

export type NodeStatusClaimVerification = Readonly<
  Partial<Record<NodeStatusClaimSection, Readonly<Record<string, NodeStatusClaimEntry>>>>
>;

/** The 4.0 claim: the node's own state, the malleability it was measured against, and its results by type. */
export interface NodeStatusClaim {
  readonly [NODE_STATUS_CLAIM_FIELD.STATE]: SpecTreeNodeState;
  readonly [NODE_STATUS_CLAIM_FIELD.MALLEABILITY]: NodeStatusMalleability;
  readonly [NODE_STATUS_CLAIM_FIELD.VERIFICATION]: NodeStatusClaimVerification;
}

/** One result of a claim with the section and key that locate it. */
export interface NodeStatusClaimResult {
  readonly section: NodeStatusClaimSection;
  readonly key: string;
  readonly entry: NodeStatusClaimEntry;
}

const CLAIM_SECTIONS: ReadonlySet<string> = new Set(Object.values(NODE_STATUS_CLAIM_SECTION));
const CLAIM_VERDICTS: ReadonlySet<string> = new Set(Object.values(NODE_STATUS_EVIDENCE_OUTCOME));
const CLAIM_STATES: ReadonlySet<string> = new Set(Object.values(SPEC_TREE_NODE_STATE));
const CLAIM_MALLEABILITIES: ReadonlySet<string> = new Set(Object.values(NODE_STATUS_MALLEABILITY));
const CLAIM_ACTOR_KINDS: ReadonlySet<string> = new Set(Object.values(NODE_STATUS_ACTOR_KIND));
const CLAIM_ENTRY_FIELDS: ReadonlySet<string> = new Set([
  NODE_STATUS_CLAIM_FIELD.VERDICT,
  NODE_STATUS_CLAIM_FIELD.COMMIT,
  NODE_STATUS_CLAIM_FIELD.READ,
  NODE_STATUS_CLAIM_FIELD.ACTOR,
  NODE_STATUS_CLAIM_FIELD.RUN,
]);
const CLAIM_TOP_LEVEL_FIELDS: ReadonlySet<string> = new Set([
  NODE_STATUS_CLAIM_FIELD.STATE,
  NODE_STATUS_CLAIM_FIELD.MALLEABILITY,
  NODE_STATUS_CLAIM_FIELD.VERIFICATION,
]);

/** Every result of a claim, in section and key order of the document. */
export function nodeStatusClaimResults(claim: NodeStatusClaim): readonly NodeStatusClaimResult[] {
  const results: NodeStatusClaimResult[] = [];
  for (const [section, entries] of Object.entries(claim[NODE_STATUS_CLAIM_FIELD.VERIFICATION])) {
    for (const [key, entry] of Object.entries(entries)) {
      results.push({ section: section as NodeStatusClaimSection, key, entry });
    }
  }
  return results;
}

/** The lifecycle input of each result of a 4.0 claim: its own verdict, with no rollup across entries. */
export function nodeStatusClaimVerdicts(claim: NodeStatusClaim): readonly NodeStatusEvidenceOutcome[] {
  return nodeStatusClaimResults(claim).map((result) => result.entry[NODE_STATUS_CLAIM_FIELD.VERDICT]);
}

export function serializeNodeStatusClaim(claim: NodeStatusClaim): string {
  return `${JSON.stringify(claim, null, NODE_STATUS_CLAIM_JSON_INDENT)}\n`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalid(source: string, message: string): Error {
  return new Error(`Invalid spx.status.json at ${source}: ${message}`);
}

/** Parse a 4.0 claim document, rejecting unknown fields, an unpinned passed or failed entry, and a pinned not-run entry. */
export function parseNodeStatusClaim(candidate: Record<string, unknown>, source: string): NodeStatusClaim {
  for (const field of Object.keys(candidate)) {
    if (!CLAIM_TOP_LEVEL_FIELDS.has(field)) throw invalid(source, `unknown field "${field}"`);
  }
  const state = candidate[NODE_STATUS_CLAIM_FIELD.STATE];
  if (typeof state !== "string" || !CLAIM_STATES.has(state)) throw invalid(source, "state is invalid");
  const malleability = candidate[NODE_STATUS_CLAIM_FIELD.MALLEABILITY];
  if (typeof malleability !== "string" || !CLAIM_MALLEABILITIES.has(malleability)) {
    throw invalid(source, "malleability is invalid");
  }
  const verification = candidate[NODE_STATUS_CLAIM_FIELD.VERIFICATION];
  if (!isObject(verification)) throw invalid(source, "verification must be an object");
  const sections: Partial<Record<NodeStatusClaimSection, Record<string, NodeStatusClaimEntry>>> = {};
  for (const [section, entries] of Object.entries(verification)) {
    if (!CLAIM_SECTIONS.has(section)) throw invalid(source, `unknown verification section "${section}"`);
    if (!isObject(entries)) throw invalid(source, `verification.${section} must be an object`);
    const parsed: Record<string, NodeStatusClaimEntry> = {};
    for (const [key, entry] of Object.entries(entries)) {
      parsed[key] = parseEntry(entry, `verification.${section}.${key}`, source);
    }
    sections[section as NodeStatusClaimSection] = parsed;
  }
  return {
    [NODE_STATUS_CLAIM_FIELD.STATE]: state as SpecTreeNodeState,
    [NODE_STATUS_CLAIM_FIELD.MALLEABILITY]: malleability as NodeStatusMalleability,
    [NODE_STATUS_CLAIM_FIELD.VERIFICATION]: sections,
  };
}

function parseEntry(candidate: unknown, location: string, source: string): NodeStatusClaimEntry {
  if (!isObject(candidate)) throw invalid(source, `${location} must be an object`);
  for (const field of Object.keys(candidate)) {
    if (!CLAIM_ENTRY_FIELDS.has(field)) throw invalid(source, `${location} has unknown field "${field}"`);
  }
  const verdict = candidate[NODE_STATUS_CLAIM_FIELD.VERDICT];
  if (typeof verdict !== "string" || !CLAIM_VERDICTS.has(verdict)) {
    throw invalid(source, `${location}.verdict is invalid`);
  }
  const commit = candidate[NODE_STATUS_CLAIM_FIELD.COMMIT];
  const read = candidate[NODE_STATUS_CLAIM_FIELD.READ];
  const pinned = commit !== undefined || read !== undefined;
  if (verdict === NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN) {
    if (pinned) throw invalid(source, `${location} is not-run and carries a pin`);
  } else if (typeof commit !== "string" || !isStringArray(read)) {
    throw invalid(source, `${location} is ${verdict} and carries no pin of commit and read paths`);
  }
  const entry: { -readonly [K in keyof NodeStatusClaimEntry]: NodeStatusClaimEntry[K] } = {
    [NODE_STATUS_CLAIM_FIELD.VERDICT]: verdict as NodeStatusEvidenceOutcome,
  };
  if (typeof commit === "string" && isStringArray(read)) {
    entry[NODE_STATUS_CLAIM_FIELD.COMMIT] = commit;
    entry[NODE_STATUS_CLAIM_FIELD.READ] = read;
  }
  const actor = candidate[NODE_STATUS_CLAIM_FIELD.ACTOR];
  if (actor !== undefined) entry[NODE_STATUS_CLAIM_FIELD.ACTOR] = parseActor(actor, location, source);
  const run = candidate[NODE_STATUS_CLAIM_FIELD.RUN];
  if (run !== undefined) {
    if (typeof run !== "string") throw invalid(source, `${location}.run must be a string`);
    entry[NODE_STATUS_CLAIM_FIELD.RUN] = run;
  }
  return entry;
}

function parseActor(candidate: unknown, location: string, source: string): NodeStatusActor {
  if (!isObject(candidate)) throw invalid(source, `${location}.actor must be an object`);
  const kind = candidate[NODE_STATUS_CLAIM_FIELD.ACTOR_KIND];
  const id = candidate[NODE_STATUS_CLAIM_FIELD.ACTOR_ID];
  if (typeof kind !== "string" || !CLAIM_ACTOR_KINDS.has(kind) || typeof id !== "string") {
    throw invalid(source, `${location}.actor is invalid`);
  }
  return {
    [NODE_STATUS_CLAIM_FIELD.ACTOR_KIND]: kind as NodeStatusActorKind,
    [NODE_STATUS_CLAIM_FIELD.ACTOR_ID]: id,
  };
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
