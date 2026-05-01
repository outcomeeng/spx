/**
 * Audit verdict reader — parses an audit verdict XML file from disk into a
 * typed in-memory representation.
 *
 * All downstream verify stages (structural, semantic, paths) import
 * AuditVerdict from this module and operate on the parsed representation
 * rather than raw XML.
 *
 * @module audit/reader
 */

import { readFile } from "node:fs/promises";

import { XMLParser, XMLValidator } from "fast-xml-parser";

export interface AuditFinding {
  readonly spec_file?: string;
  readonly test_file?: string;
}

export const AUDIT_VERDICT_VALUE = {
  APPROVED: "APPROVED",
  REJECT: "REJECT",
} as const;

export type AuditVerdictValue = (typeof AUDIT_VERDICT_VALUE)[keyof typeof AUDIT_VERDICT_VALUE];

export const AUDIT_GATE_STATUS = {
  FAIL: "FAIL",
  PASS: "PASS",
  SKIPPED: "SKIPPED",
} as const;

export type AuditGateStatus = (typeof AUDIT_GATE_STATUS)[keyof typeof AUDIT_GATE_STATUS];

export interface AuditGate {
  readonly name?: string;
  readonly status?: string;
  readonly skipped_reason?: string;
  readonly count?: string;
  readonly findings: readonly AuditFinding[];
}

export interface AuditVerdictHeader {
  readonly spec_node?: string;
  readonly verdict?: string;
  readonly timestamp?: string;
}

export interface AuditVerdict {
  readonly header?: AuditVerdictHeader;
  readonly gates: readonly AuditGate[];
}

export const AUDIT_VERDICT_XML = {
  ROOT: "audit_verdict",
  HEADER: "header",
  SPEC_NODE: "spec_node",
  VERDICT: "verdict",
  TIMESTAMP: "timestamp",
  GATES: "gates",
  GATE: "gate",
  NAME: "name",
  STATUS: "status",
  SKIPPED_REASON: "skipped_reason",
  FINDINGS: "findings",
  FINDING: "finding",
  COUNT: "count",
  PARSED_COUNT: "@_count",
  SPEC_FILE: "spec_file",
  TEST_FILE: "test_file",
} as const;

const ARRAY_TAGS = new Set<string>([AUDIT_VERDICT_XML.GATE, AUDIT_VERDICT_XML.FINDING]);

const PARSER_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  parseAttributeValue: false,
  isArray: (name: string) => ARRAY_TAGS.has(name),
} as const;

/**
 * Reads and parses an audit verdict XML file from disk.
 *
 * @throws {Error} When the file does not exist — message includes filePath.
 * @throws {Error} When the file is not well-formed XML — message includes filePath.
 */
export async function readVerdictFile(filePath: string): Promise<AuditVerdict> {
  let xml: string;
  try {
    xml = await readFile(filePath, "utf-8");
  } catch (cause) {
    throw new Error(`Failed to read verdict file: ${filePath}`, { cause });
  }

  const validation = XMLValidator.validate(xml);
  if (validation !== true) {
    throw new Error(
      `Malformed XML in verdict file: ${filePath}: ${validation.err.msg}`,
    );
  }

  const parser = new XMLParser(PARSER_OPTIONS);
  const parsed = parser.parse(xml) as Record<string, unknown>;

  return buildVerdict(parsed);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function buildVerdict(parsed: Record<string, unknown>): AuditVerdict {
  const rootUnknown = parsed[AUDIT_VERDICT_XML.ROOT];
  if (!isObject(rootUnknown)) {
    return { gates: [] };
  }

  const headerUnknown = rootUnknown[AUDIT_VERDICT_XML.HEADER];
  const gatesUnknown = rootUnknown[AUDIT_VERDICT_XML.GATES];

  return {
    header: isObject(headerUnknown) ? buildHeader(headerUnknown) : undefined,
    gates: isObject(gatesUnknown) ? buildGates(gatesUnknown) : [],
  };
}

function buildHeader(raw: Record<string, unknown>): AuditVerdictHeader {
  return {
    spec_node: asString(raw[AUDIT_VERDICT_XML.SPEC_NODE]),
    verdict: asString(raw[AUDIT_VERDICT_XML.VERDICT]),
    timestamp: asString(raw[AUDIT_VERDICT_XML.TIMESTAMP]),
  };
}

function buildGates(raw: Record<string, unknown>): readonly AuditGate[] {
  const gatesUnknown = raw[AUDIT_VERDICT_XML.GATE];
  if (!Array.isArray(gatesUnknown)) return [];
  return gatesUnknown.filter(isObject).map(buildGate);
}

function buildGate(raw: Record<string, unknown>): AuditGate {
  const findingsUnknown = raw[AUDIT_VERDICT_XML.FINDINGS];
  return {
    name: asString(raw[AUDIT_VERDICT_XML.NAME]),
    status: asString(raw[AUDIT_VERDICT_XML.STATUS]),
    skipped_reason: asString(raw[AUDIT_VERDICT_XML.SKIPPED_REASON]),
    count: isObject(findingsUnknown) ? asString(findingsUnknown[AUDIT_VERDICT_XML.PARSED_COUNT]) : undefined,
    findings: isObject(findingsUnknown) ? buildFindings(findingsUnknown) : [],
  };
}

function buildFindings(raw: Record<string, unknown>): readonly AuditFinding[] {
  const findingsUnknown = raw[AUDIT_VERDICT_XML.FINDING];
  if (!Array.isArray(findingsUnknown)) return [];
  return findingsUnknown.filter(isObject).map(buildFinding);
}

function buildFinding(raw: Record<string, unknown>): AuditFinding {
  return {
    spec_file: asString(raw[AUDIT_VERDICT_XML.SPEC_FILE]),
    test_file: asString(raw[AUDIT_VERDICT_XML.TEST_FILE]),
  };
}
