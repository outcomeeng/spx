/**
 * Evidence-help harness for the record-run help evidence: valid scope and finding payloads of each
 * verification type, drawn so every conditional field is present at least once, the pure validator
 * that judges each, and the field paths and value probes a test derives the help's required content
 * from without reading the help's own field description.
 *
 * @module testing/harnesses/verify/evidence-help
 */

import * as fc from "fast-check";

import {
  AUDIT_CLASS,
  AUDIT_COVERAGE_REQUIREMENT,
  AUDIT_COVERAGE_STATUS,
  AUDIT_FINDING_SEVERITY,
  AUDIT_KIND,
  REVIEW_ANCHOR_SIDE,
  REVIEW_FINDING_DISPOSITION,
  REVIEW_SCOPE_COVERAGE_STATE,
  TEST_PAYLOAD_FIELD,
  validateAuditFinding,
  validateAuditScope,
  validateReviewFinding,
  validateReviewScope,
  validateTestFinding,
  validateTestScope,
  VERIFY_EVIDENCE_KIND,
  VERIFY_FINDING_DISPOSITION,
  VERIFY_VERIFICATION_TYPE,
  type VerifyVerificationType,
} from "@/domains/verify/verify";
import { EVIDENCE_PAYLOAD_HELP } from "@/interfaces/cli/verify";
import type { JsonValue } from "@/lib/agent-run-journal";
import { arbitraryDomainLiteral, arbitraryTestFilePath } from "@testing/generators/literal/literal";
import { arbitraryAuditFinding, auditFindingAtSeverity } from "@testing/generators/verify/audit";
import {
  arbitraryBaseRefEvidence,
  arbitraryIssuesEntryReference,
  sampleVerifyTestValue,
  VERIFY_TEST_GENERATOR,
} from "@testing/generators/verify/verify";

/** The evidence kinds a caller appends through `scope add` and `finding add`. */
export const EVIDENCE_HELP_KIND = {
  SCOPE: VERIFY_EVIDENCE_KIND.SCOPE,
  FINDING: VERIFY_EVIDENCE_KIND.FINDING,
} as const;

export type EvidenceHelpKind = (typeof EVIDENCE_HELP_KIND)[keyof typeof EVIDENCE_HELP_KIND];

/** A payload the verification type's validator for the evidence kind accepts. */
export interface EvidenceHelpCase {
  readonly verificationType: VerifyVerificationType;
  readonly kind: EvidenceHelpKind;
  readonly payload: JsonValue;
}

type PureEvidenceValidator = (payload: JsonValue) => { readonly ok: boolean; readonly reason?: string };

/** The pure payload validator of each verification type and evidence kind. */
const PURE_EVIDENCE_VALIDATORS: Readonly<
  Record<VerifyVerificationType, Readonly<Record<EvidenceHelpKind, PureEvidenceValidator>>>
> = {
  [VERIFY_VERIFICATION_TYPE.AUDIT]: {
    [EVIDENCE_HELP_KIND.SCOPE]: validateAuditScope,
    [EVIDENCE_HELP_KIND.FINDING]: validateAuditFinding,
  },
  [VERIFY_VERIFICATION_TYPE.REVIEW]: {
    [EVIDENCE_HELP_KIND.SCOPE]: validateReviewScope,
    [EVIDENCE_HELP_KIND.FINDING]: validateReviewFinding,
  },
  [VERIFY_VERIFICATION_TYPE.TEST]: {
    [EVIDENCE_HELP_KIND.SCOPE]: validateTestScope,
    [EVIDENCE_HELP_KIND.FINDING]: validateTestFinding,
  },
};

/** The reason the pure validator gives for `payload`, or `undefined` when it accepts it. */
export function evidenceRejectionReason(
  verificationType: VerifyVerificationType,
  kind: EvidenceHelpKind,
  payload: JsonValue,
): string | undefined {
  const result = PURE_EVIDENCE_VALIDATORS[verificationType][kind](payload);
  return result.ok ? undefined : (result.reason ?? "");
}

function json(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function auditFindingCases(): readonly JsonValue[] {
  const finding = sampleVerifyTestValue(arbitraryAuditFinding());
  const issuesEntry = sampleVerifyTestValue(arbitraryIssuesEntryReference());
  const baseRefEvidence = sampleVerifyTestValue(arbitraryBaseRefEvidence());
  return [VERIFY_FINDING_DISPOSITION.BLOCKING, VERIFY_FINDING_DISPOSITION.FILED].map((severity) =>
    json(auditFindingAtSeverity(finding, severity, issuesEntry, baseRefEvidence))
  );
}

function auditScopeCases(): readonly JsonValue[] {
  return [
    json(
      sampleVerifyTestValue(
        VERIFY_TEST_GENERATOR.auditScopeUnit().filter((unit) =>
          unit.parentUnitId !== undefined && unit.producerProvenance?.toolVersion !== undefined
          && unit.priorContext.languagePartition !== undefined
        ),
      ),
    ),
  ];
}

function reviewFindingCases(): readonly JsonValue[] {
  const anchoredFiled = VERIFY_TEST_GENERATOR.filedOrStaleReviewFinding().filter((finding) =>
    finding.side !== undefined && finding.finding.disposition === REVIEW_FINDING_DISPOSITION.FILED
  );
  return [
    json(sampleVerifyTestValue(anchoredFiled.filter((finding) => finding.line !== undefined))),
    json(sampleVerifyTestValue(anchoredFiled.filter((finding) => finding.position !== undefined))),
  ];
}

function reviewScopeCases(): readonly JsonValue[] {
  return [json(sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewScopeUnit()))];
}

function testScopeCases(): readonly JsonValue[] {
  const accepted = sampleVerifyTestValue(
    VERIFY_TEST_GENERATOR.testReadPathsAcceptedCase().filter((testCase) => testCase.recordedPaths.length > 0),
  );
  return [accepted.payload];
}

function testFindingCases(): readonly JsonValue[] {
  return [
    json(
      sampleVerifyTestValue(
        fc.record({
          [TEST_PAYLOAD_FIELD.MODULE_ID]: arbitraryTestFilePath(),
          [TEST_PAYLOAD_FIELD.TEST_NAME]: arbitraryDomainLiteral(),
          [TEST_PAYLOAD_FIELD.ERRORS]: fc.array(arbitraryDomainLiteral(), { minLength: 1, maxLength: 2 }),
        }),
      ),
    ),
  ];
}

const EVIDENCE_HELP_CASES: Readonly<
  Record<VerifyVerificationType, Readonly<Record<EvidenceHelpKind, () => readonly JsonValue[]>>>
> = {
  [VERIFY_VERIFICATION_TYPE.AUDIT]: {
    [EVIDENCE_HELP_KIND.SCOPE]: auditScopeCases,
    [EVIDENCE_HELP_KIND.FINDING]: auditFindingCases,
  },
  [VERIFY_VERIFICATION_TYPE.REVIEW]: {
    [EVIDENCE_HELP_KIND.SCOPE]: reviewScopeCases,
    [EVIDENCE_HELP_KIND.FINDING]: reviewFindingCases,
  },
  [VERIFY_VERIFICATION_TYPE.TEST]: {
    [EVIDENCE_HELP_KIND.SCOPE]: testScopeCases,
    [EVIDENCE_HELP_KIND.FINDING]: testFindingCases,
  },
};

/** The accepted payloads of `verificationType` for `kind`. */
export function evidenceHelpCases(
  verificationType: VerifyVerificationType,
  kind: EvidenceHelpKind,
): EvidenceHelpCase[] {
  return EVIDENCE_HELP_CASES[verificationType][kind]().map((payload) => ({ verificationType, kind, payload }));
}

type JsonRecord = { readonly [key: string]: JsonValue };

function isRecord(value: JsonValue | undefined): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Every object-key path of `payload`, outermost first; an array is a leaf. */
export function payloadFieldPaths(payload: JsonValue, prefix: readonly string[] = []): string[][] {
  if (!isRecord(payload)) return [];
  return Object.entries(payload).flatMap(([key, value]) => {
    const path = [...prefix, key];
    return [path, ...payloadFieldPaths(value, path)];
  });
}

function editAt(
  payload: JsonValue,
  path: readonly string[],
  edit: (record: JsonRecord, key: string) => JsonRecord,
): JsonValue {
  if (!isRecord(payload) || path.length === 0) return payload;
  const [head = "", ...rest] = path;
  if (rest.length === 0) return edit(payload, head);
  return { ...payload, [head]: editAt(payload[head] ?? null, rest, edit) };
}

/** `payload` with the field at `path` removed. */
export function withoutField(payload: JsonValue, path: readonly string[]): JsonValue {
  return editAt(payload, path, (record, key) => {
    const { [key]: _removed, ...rest } = record;
    return rest;
  });
}

/** `payload` with the field at `path` set to `value`. */
export function withField(payload: JsonValue, path: readonly string[], value: JsonValue): JsonValue {
  return editAt(payload, path, (record, key) => ({ ...record, [key]: value }));
}

/** The string value at `path` in `payload`, or `undefined` when it holds no string. */
export function stringAt(payload: JsonValue, path: readonly string[]): string | undefined {
  let value: JsonValue | undefined = payload;
  for (const key of path) value = isRecord(value) ? value[key] : undefined;
  return typeof value === "string" ? value : undefined;
}

const QUOTED_FIELD_PATH = /"([^"]+)"/g;

/** Every field path a rejection reason names in quotes. */
export function rejectedFieldPaths(reason: string): string[] {
  return [...reason.matchAll(QUOTED_FIELD_PATH)].map((match) => String(match[1]));
}

/**
 * The candidate values a test substitutes into a string field to learn whether the validator
 * accepts it: every member of each closed vocabulary the payload schemas draw on.
 */
export function enumeratedValueCandidates(): readonly string[] {
  return [
    ...new Set([
      ...Object.values(AUDIT_CLASS),
      ...Object.values(AUDIT_KIND),
      ...Object.values(AUDIT_COVERAGE_REQUIREMENT),
      ...Object.values(AUDIT_COVERAGE_STATUS),
      ...Object.values(AUDIT_FINDING_SEVERITY),
      ...Object.values(REVIEW_ANCHOR_SIDE),
      ...Object.values(REVIEW_FINDING_DISPOSITION),
      ...Object.values(REVIEW_SCOPE_COVERAGE_STATE),
    ]),
  ];
}

/** A string no closed vocabulary holds, used to learn whether a field is enumerated. */
export function unenumeratedValue(candidates: readonly string[]): string {
  return sampleVerifyTestValue(arbitraryDomainLiteral().filter((value) => !candidates.includes(value)));
}

/**
 * The lines of `help` under the heading line for `heading`, up to the next heading line. A heading
 * line holds the section indent and no further indent; a field line holds the deeper field indent.
 */
export function helpSectionLines(help: string, heading: string): string[] {
  const lines = help.split(EVIDENCE_PAYLOAD_HELP.lineSeparator);
  const headingLine = `${EVIDENCE_PAYLOAD_HELP.sectionIndent}${heading}${EVIDENCE_PAYLOAD_HELP.headingSuffix}`;
  const start = lines.indexOf(headingLine);
  if (start < 0) return [];
  const section: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (!line.startsWith(EVIDENCE_PAYLOAD_HELP.fieldIndent)) break;
    section.push(line);
  }
  return section;
}

/** The help line naming `fieldName` in `section`, or `undefined` when none names it. */
export function helpFieldLine(section: readonly string[], fieldName: string): string | undefined {
  const prefix = `${EVIDENCE_PAYLOAD_HELP.fieldIndent}${fieldName}${EVIDENCE_PAYLOAD_HELP.fieldNameSuffix}`;
  return section.find((line) => line.startsWith(prefix));
}

/** The allowed values a help field line lists, or none when it lists none. */
export function helpAllowedValues(line: string): string[] {
  const part = line.split(EVIDENCE_PAYLOAD_HELP.partsSeparator).find((segment) =>
    segment.includes(EVIDENCE_PAYLOAD_HELP.allowedValuesPrefix)
  );
  if (part === undefined) return [];
  const start = part.indexOf(EVIDENCE_PAYLOAD_HELP.allowedValuesPrefix)
    + EVIDENCE_PAYLOAD_HELP.allowedValuesPrefix.length;
  return part.slice(start).split(EVIDENCE_PAYLOAD_HELP.valuesSeparator);
}

const HELP_OPTIONS_HEADING = "Options:";
const HELP_SECTION_BREAK = "\n\n";
const HELP_OPTION_LINE = /^\s+(?:-[a-zA-Z], )?(--[a-z][a-z0-9-]*)/gm;
const HELP_FLAG_SPELLINGS: readonly string[] = ["--help", "-h"];

/** The long option flags the Options section of a Commander help text lists, apart from the help flag itself. */
export function helpOptionFlags(help: string): string[] {
  const start = help.indexOf(HELP_OPTIONS_HEADING);
  if (start < 0) return [];
  const end = help.indexOf(HELP_SECTION_BREAK, start);
  const section = help.slice(start, end < 0 ? help.length : end);
  return [...section.matchAll(HELP_OPTION_LINE)].map((match) => String(match[1])).filter((flag) =>
    !HELP_FLAG_SPELLINGS.includes(flag)
  );
}

/** Whether Commander's standard error refuses `flag` as an option the command does not accept. */
export function rejectsAsUnknownOption(stderr: string, flag: string): boolean {
  return stderr.includes(`unknown option '${flag}'`);
}
