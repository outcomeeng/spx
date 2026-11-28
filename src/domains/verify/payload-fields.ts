/**
 * The payload fields each verification type's scope and finding validators read, described for a
 * reader: each field's dotted path, the value it holds, its allowed values when the validator
 * accepts a closed set, and whether the validator requires it. The run lifecycle's help renders
 * this description, so a session learns the payload a validator accepts before it sends one.
 *
 * @module domains/verify/payload-fields
 */

import {
  AUDIT_CLASS,
  AUDIT_COVERAGE_REQUIREMENT,
  AUDIT_COVERAGE_STATUS,
  AUDIT_FINDING_SEVERITY,
  AUDIT_KIND,
  AUDIT_PAYLOAD_FIELD,
  ISSUES_ENTRY_FIELD,
  PROBE_PAYLOAD_FIELD,
  PROBE_UNIT_KIND,
  REVIEW_ANCHOR_SIDE,
  REVIEW_FINDING_DISPOSITION,
  REVIEW_PAYLOAD_FIELD,
  REVIEW_SCOPE_COVERAGE_STATE,
  TEST_PAYLOAD_FIELD,
  VERIFY_EVIDENCE_KIND,
  VERIFY_FINDING_DISPOSITION,
  VERIFY_SCOPE_PAYLOAD_FIELD,
  VERIFY_VERIFICATION_TYPE,
  type VerifyVerificationType,
} from "@/domains/verify/verify";

/** The kinds of value a payload field holds. */
export const EVIDENCE_FIELD_VALUE = {
  STRING: "string",
  NON_EMPTY_STRING: "non-empty string",
  POSITIVE_INTEGER: "positive integer",
  OBJECT: "object",
  STRING_ARRAY: "array of strings",
  PATH_ARRAY: "non-empty array of product-relative paths",
} as const;

export type EvidenceFieldValue = (typeof EVIDENCE_FIELD_VALUE)[keyof typeof EVIDENCE_FIELD_VALUE];

/** Whether a validator requires a field, accepts its absence, or requires it under a stated condition. */
export const EVIDENCE_FIELD_PRESENCE = {
  REQUIRED: "required",
  OPTIONAL: "optional",
  CONDITIONAL: "conditional",
} as const;

export type EvidenceFieldPresence = (typeof EVIDENCE_FIELD_PRESENCE)[keyof typeof EVIDENCE_FIELD_PRESENCE];

/** One payload field: its path from the payload root, its value, its allowed values, and its presence. */
export interface EvidencePayloadField {
  readonly path: readonly string[];
  readonly value: EvidenceFieldValue;
  readonly values?: readonly string[];
  readonly presence: EvidenceFieldPresence;
  /** For a conditional field, the condition under which the validator requires it. */
  readonly condition?: string;
  /** A constraint the validator applies to the field beyond its value and allowed values. */
  readonly constraint?: string;
}

/** The scope and finding payload fields of one verification type. */
export interface EvidencePayloadFields {
  readonly [VERIFY_EVIDENCE_KIND.SCOPE]: readonly EvidencePayloadField[];
  readonly [VERIFY_EVIDENCE_KIND.FINDING]: readonly EvidencePayloadField[];
}

/** The evidence kinds whose payloads a caller appends through `scope add` and `finding add`. */
export type EvidencePayloadKind = keyof EvidencePayloadFields;

function required(
  path: readonly string[],
  value: EvidenceFieldValue,
  values?: readonly string[],
): EvidencePayloadField {
  return { path, value, presence: EVIDENCE_FIELD_PRESENCE.REQUIRED, ...(values === undefined ? {} : { values }) };
}

function optional(path: readonly string[], value: EvidenceFieldValue): EvidencePayloadField {
  return { path, value, presence: EVIDENCE_FIELD_PRESENCE.OPTIONAL };
}

function conditional(
  path: readonly string[],
  value: EvidenceFieldValue,
  condition: string,
  values?: readonly string[],
): EvidencePayloadField {
  return {
    path,
    value,
    presence: EVIDENCE_FIELD_PRESENCE.CONDITIONAL,
    condition,
    ...(values === undefined ? {} : { values }),
  };
}

function quotedValues(values: readonly string[]): string {
  return values.join(" or ");
}

const AUDIT_ENTRY_SEVERITIES = [VERIFY_FINDING_DISPOSITION.FILED, VERIFY_FINDING_DISPOSITION.STALE] as const;
const REVIEW_ENTRY_DISPOSITIONS = [REVIEW_FINDING_DISPOSITION.FILED, REVIEW_FINDING_DISPOSITION.STALE] as const;

const AUDIT_ISSUES_ENTRY_CONDITION = `when ${AUDIT_PAYLOAD_FIELD.SEVERITY} is ${quotedValues(AUDIT_ENTRY_SEVERITIES)}`;
const AUDIT_BASE_REF_CONDITION = `when ${AUDIT_PAYLOAD_FIELD.SEVERITY} is ${VERIFY_FINDING_DISPOSITION.FILED}`;
const REVIEW_DISPOSITION_PATH = `${REVIEW_PAYLOAD_FIELD.FINDING}.${REVIEW_PAYLOAD_FIELD.DISPOSITION}`;
const REVIEW_ISSUES_ENTRY_CONDITION = `when ${REVIEW_DISPOSITION_PATH} is ${quotedValues(REVIEW_ENTRY_DISPOSITIONS)}`;
const REVIEW_BASE_REF_CONDITION = `when ${REVIEW_DISPOSITION_PATH} is ${REVIEW_FINDING_DISPOSITION.FILED}`;
const REVIEW_ANCHOR_FIELDS = [
  REVIEW_PAYLOAD_FIELD.LINE,
  REVIEW_PAYLOAD_FIELD.POSITION,
  REVIEW_PAYLOAD_FIELD.SIDE,
  REVIEW_PAYLOAD_FIELD.DIFF_HUNK,
] as const;
const REVIEW_ANCHORED_CONDITION = `when the finding is anchored, carrying any of ${REVIEW_ANCHOR_FIELDS.join(", ")}`;
const REVIEW_ANCHOR_SHORT_CONDITION = "when the finding is anchored";
const REVIEW_LINE_CONDITION = `${REVIEW_ANCHOR_SHORT_CONDITION} and carries no ${REVIEW_PAYLOAD_FIELD.POSITION}`;
const REVIEW_POSITION_CONDITION = `${REVIEW_ANCHOR_SHORT_CONDITION} and carries no ${REVIEW_PAYLOAD_FIELD.LINE}`;
const AUDIT_KIND_CONSTRAINT = `compatible with ${AUDIT_PAYLOAD_FIELD.AUDIT_CLASS}`;

function auditProducerIdentityFields(root: string): readonly EvidencePayloadField[] {
  return [
    required([root], EVIDENCE_FIELD_VALUE.OBJECT),
    required([root, AUDIT_PAYLOAD_FIELD.PRODUCER_KIND], EVIDENCE_FIELD_VALUE.STRING),
    required([root, AUDIT_PAYLOAD_FIELD.AGENT_NAME], EVIDENCE_FIELD_VALUE.STRING),
    required([root, AUDIT_PAYLOAD_FIELD.AGENT_OWNING_PLUGIN_NAME], EVIDENCE_FIELD_VALUE.STRING),
    required([root, AUDIT_PAYLOAD_FIELD.SKILL_NAME], EVIDENCE_FIELD_VALUE.STRING),
    required([root, AUDIT_PAYLOAD_FIELD.SKILL_OWNING_PLUGIN_NAME], EVIDENCE_FIELD_VALUE.STRING),
    required([root, AUDIT_PAYLOAD_FIELD.INVOCATION_ROLE], EVIDENCE_FIELD_VALUE.STRING),
  ];
}

function auditProducerProvenanceFields(root: EvidencePayloadField): readonly EvidencePayloadField[] {
  const [name] = root.path;
  return [
    root,
    required([name, AUDIT_PAYLOAD_FIELD.AGENT_OWNING_PLUGIN_VERSION], EVIDENCE_FIELD_VALUE.STRING),
    required([name, AUDIT_PAYLOAD_FIELD.SKILL_OWNING_PLUGIN_VERSION], EVIDENCE_FIELD_VALUE.STRING),
    optional([name, AUDIT_PAYLOAD_FIELD.TOOL_VERSION], EVIDENCE_FIELD_VALUE.STRING),
  ];
}

const AUDIT_SCOPE_FIELDS: readonly EvidencePayloadField[] = [
  required([AUDIT_PAYLOAD_FIELD.UNIT_ID], EVIDENCE_FIELD_VALUE.STRING),
  optional([AUDIT_PAYLOAD_FIELD.PARENT_UNIT_ID], EVIDENCE_FIELD_VALUE.STRING),
  required([AUDIT_PAYLOAD_FIELD.SUBJECT], EVIDENCE_FIELD_VALUE.STRING),
  required([AUDIT_PAYLOAD_FIELD.AUDIT_CLASS], EVIDENCE_FIELD_VALUE.STRING, Object.values(AUDIT_CLASS)),
  {
    ...required([AUDIT_PAYLOAD_FIELD.AUDIT_KIND], EVIDENCE_FIELD_VALUE.STRING, Object.values(AUDIT_KIND)),
    constraint: AUDIT_KIND_CONSTRAINT,
  },
  required(
    [AUDIT_PAYLOAD_FIELD.COVERAGE_REQUIREMENT],
    EVIDENCE_FIELD_VALUE.STRING,
    Object.values(AUDIT_COVERAGE_REQUIREMENT),
  ),
  required([AUDIT_PAYLOAD_FIELD.COVERAGE_STATUS], EVIDENCE_FIELD_VALUE.STRING, Object.values(AUDIT_COVERAGE_STATUS)),
  required([AUDIT_PAYLOAD_FIELD.PRIOR_CONTEXT], EVIDENCE_FIELD_VALUE.OBJECT),
  required(
    [AUDIT_PAYLOAD_FIELD.PRIOR_CONTEXT, AUDIT_PAYLOAD_FIELD.CHANGED_FILE_PARTITION],
    EVIDENCE_FIELD_VALUE.STRING,
  ),
  required([AUDIT_PAYLOAD_FIELD.PRIOR_CONTEXT, AUDIT_PAYLOAD_FIELD.CONCERN_PARTITION], EVIDENCE_FIELD_VALUE.STRING),
  optional([AUDIT_PAYLOAD_FIELD.PRIOR_CONTEXT, AUDIT_PAYLOAD_FIELD.LANGUAGE_PARTITION], EVIDENCE_FIELD_VALUE.STRING),
  ...auditProducerIdentityFields(AUDIT_PAYLOAD_FIELD.EXPECTED_PRODUCER),
  ...auditProducerIdentityFields(AUDIT_PAYLOAD_FIELD.RECORDED_BY_RUN_DRIVER),
  ...auditProducerProvenanceFields(optional([AUDIT_PAYLOAD_FIELD.PRODUCER_PROVENANCE], EVIDENCE_FIELD_VALUE.OBJECT)),
];

const AUDIT_FINDING_FIELDS: readonly EvidencePayloadField[] = [
  required([AUDIT_PAYLOAD_FIELD.UNIT_ID], EVIDENCE_FIELD_VALUE.STRING),
  required([AUDIT_PAYLOAD_FIELD.RULE], EVIDENCE_FIELD_VALUE.STRING),
  required([AUDIT_PAYLOAD_FIELD.LOCATION], EVIDENCE_FIELD_VALUE.STRING),
  required([AUDIT_PAYLOAD_FIELD.MESSAGE], EVIDENCE_FIELD_VALUE.STRING),
  required([AUDIT_PAYLOAD_FIELD.SEVERITY], EVIDENCE_FIELD_VALUE.STRING, Object.values(AUDIT_FINDING_SEVERITY)),
  conditional([AUDIT_PAYLOAD_FIELD.ISSUES_ENTRY], EVIDENCE_FIELD_VALUE.OBJECT, AUDIT_ISSUES_ENTRY_CONDITION),
  conditional(
    [AUDIT_PAYLOAD_FIELD.ISSUES_ENTRY, ISSUES_ENTRY_FIELD.PATH],
    EVIDENCE_FIELD_VALUE.STRING,
    `when ${AUDIT_PAYLOAD_FIELD.ISSUES_ENTRY} is present`,
  ),
  conditional(
    [AUDIT_PAYLOAD_FIELD.ISSUES_ENTRY, ISSUES_ENTRY_FIELD.HEADING],
    EVIDENCE_FIELD_VALUE.STRING,
    `when ${AUDIT_PAYLOAD_FIELD.ISSUES_ENTRY} is present`,
  ),
  conditional([AUDIT_PAYLOAD_FIELD.BASE_REF_EVIDENCE], EVIDENCE_FIELD_VALUE.STRING, AUDIT_BASE_REF_CONDITION),
  ...auditProducerIdentityFields(AUDIT_PAYLOAD_FIELD.PRODUCER_IDENTITY),
  ...auditProducerProvenanceFields(required([AUDIT_PAYLOAD_FIELD.PRODUCER_PROVENANCE], EVIDENCE_FIELD_VALUE.OBJECT)),
  required([AUDIT_PAYLOAD_FIELD.EVIDENCE], EVIDENCE_FIELD_VALUE.OBJECT),
  required([AUDIT_PAYLOAD_FIELD.EVIDENCE, AUDIT_PAYLOAD_FIELD.OBSERVED], EVIDENCE_FIELD_VALUE.STRING),
  required([AUDIT_PAYLOAD_FIELD.EVIDENCE, AUDIT_PAYLOAD_FIELD.EXPECTED], EVIDENCE_FIELD_VALUE.STRING),
];

const REVIEW_SCOPE_FIELDS: readonly EvidencePayloadField[] = [
  required([REVIEW_PAYLOAD_FIELD.PATH], EVIDENCE_FIELD_VALUE.STRING),
  required([REVIEW_PAYLOAD_FIELD.COMMIT], EVIDENCE_FIELD_VALUE.STRING),
  required([REVIEW_PAYLOAD_FIELD.SIDE], EVIDENCE_FIELD_VALUE.STRING, Object.values(REVIEW_ANCHOR_SIDE)),
  required(
    [REVIEW_PAYLOAD_FIELD.COVERAGE_STATE],
    EVIDENCE_FIELD_VALUE.STRING,
    Object.values(REVIEW_SCOPE_COVERAGE_STATE),
  ),
  optional([REVIEW_PAYLOAD_FIELD.LINE], EVIDENCE_FIELD_VALUE.POSITIVE_INTEGER),
  optional([REVIEW_PAYLOAD_FIELD.POSITION], EVIDENCE_FIELD_VALUE.POSITIVE_INTEGER),
  optional([REVIEW_PAYLOAD_FIELD.PROVIDER_IDENTITY], EVIDENCE_FIELD_VALUE.STRING),
  optional([REVIEW_PAYLOAD_FIELD.URL], EVIDENCE_FIELD_VALUE.STRING),
];

const REVIEW_FINDING_FIELDS: readonly EvidencePayloadField[] = [
  required([REVIEW_PAYLOAD_FIELD.ORIGINAL_COMMIT], EVIDENCE_FIELD_VALUE.STRING),
  required([REVIEW_PAYLOAD_FIELD.BODY], EVIDENCE_FIELD_VALUE.STRING),
  required([REVIEW_PAYLOAD_FIELD.FINDING], EVIDENCE_FIELD_VALUE.OBJECT),
  required(
    [REVIEW_PAYLOAD_FIELD.FINDING, REVIEW_PAYLOAD_FIELD.DISPOSITION],
    EVIDENCE_FIELD_VALUE.STRING,
    Object.values(REVIEW_FINDING_DISPOSITION),
  ),
  required([REVIEW_PAYLOAD_FIELD.FINDING, REVIEW_PAYLOAD_FIELD.SUMMARY], EVIDENCE_FIELD_VALUE.NON_EMPTY_STRING),
  conditional(
    [REVIEW_PAYLOAD_FIELD.FINDING, REVIEW_PAYLOAD_FIELD.ISSUES_ENTRY],
    EVIDENCE_FIELD_VALUE.OBJECT,
    REVIEW_ISSUES_ENTRY_CONDITION,
  ),
  conditional(
    [REVIEW_PAYLOAD_FIELD.FINDING, REVIEW_PAYLOAD_FIELD.ISSUES_ENTRY, ISSUES_ENTRY_FIELD.PATH],
    EVIDENCE_FIELD_VALUE.STRING,
    `when ${REVIEW_PAYLOAD_FIELD.FINDING}.${REVIEW_PAYLOAD_FIELD.ISSUES_ENTRY} is present`,
  ),
  conditional(
    [REVIEW_PAYLOAD_FIELD.FINDING, REVIEW_PAYLOAD_FIELD.ISSUES_ENTRY, ISSUES_ENTRY_FIELD.HEADING],
    EVIDENCE_FIELD_VALUE.STRING,
    `when ${REVIEW_PAYLOAD_FIELD.FINDING}.${REVIEW_PAYLOAD_FIELD.ISSUES_ENTRY} is present`,
  ),
  conditional(
    [REVIEW_PAYLOAD_FIELD.FINDING, REVIEW_PAYLOAD_FIELD.BASE_REF_EVIDENCE],
    EVIDENCE_FIELD_VALUE.STRING,
    REVIEW_BASE_REF_CONDITION,
  ),
  conditional([REVIEW_PAYLOAD_FIELD.PATH], EVIDENCE_FIELD_VALUE.STRING, REVIEW_ANCHORED_CONDITION),
  conditional(
    [REVIEW_PAYLOAD_FIELD.SIDE],
    EVIDENCE_FIELD_VALUE.STRING,
    REVIEW_ANCHORED_CONDITION,
    Object.values(REVIEW_ANCHOR_SIDE),
  ),
  conditional([REVIEW_PAYLOAD_FIELD.DIFF_HUNK], EVIDENCE_FIELD_VALUE.STRING, REVIEW_ANCHORED_CONDITION),
  conditional([REVIEW_PAYLOAD_FIELD.LINE], EVIDENCE_FIELD_VALUE.POSITIVE_INTEGER, REVIEW_LINE_CONDITION),
  conditional([REVIEW_PAYLOAD_FIELD.POSITION], EVIDENCE_FIELD_VALUE.POSITIVE_INTEGER, REVIEW_POSITION_CONDITION),
  optional([REVIEW_PAYLOAD_FIELD.PROVIDER_IDENTITY], EVIDENCE_FIELD_VALUE.STRING),
  optional([REVIEW_PAYLOAD_FIELD.URL], EVIDENCE_FIELD_VALUE.STRING),
];

const TEST_SCOPE_FIELDS: readonly EvidencePayloadField[] = [
  required([TEST_PAYLOAD_FIELD.MODULE_ID], EVIDENCE_FIELD_VALUE.STRING),
  optional([TEST_PAYLOAD_FIELD.READ_PATHS], EVIDENCE_FIELD_VALUE.PATH_ARRAY),
];

const TEST_FINDING_FIELDS: readonly EvidencePayloadField[] = [
  required([TEST_PAYLOAD_FIELD.MODULE_ID], EVIDENCE_FIELD_VALUE.STRING),
  required([TEST_PAYLOAD_FIELD.TEST_NAME], EVIDENCE_FIELD_VALUE.STRING),
  required([TEST_PAYLOAD_FIELD.ERRORS], EVIDENCE_FIELD_VALUE.STRING_ARRAY),
];

const PROBE_PATH_CONSTRAINT = "a product-relative path";
const PROBE_SLUG_CONSTRAINT = "lowercase letters and digits in hyphen-joined groups";

function probeUnitKindCondition(unitKind: string): string {
  return `when ${PROBE_PAYLOAD_FIELD.UNIT_KIND} is ${unitKind}`;
}

const PROBE_SCOPE_FIELDS: readonly EvidencePayloadField[] = [
  required([PROBE_PAYLOAD_FIELD.UNIT_KIND], EVIDENCE_FIELD_VALUE.STRING, Object.values(PROBE_UNIT_KIND)),
  {
    ...required([PROBE_PAYLOAD_FIELD.SUBJECT], EVIDENCE_FIELD_VALUE.NON_EMPTY_STRING),
    constraint: PROBE_PATH_CONSTRAINT,
  },
  {
    ...conditional(
      [PROBE_PAYLOAD_FIELD.SLUG],
      EVIDENCE_FIELD_VALUE.NON_EMPTY_STRING,
      probeUnitKindCondition(PROBE_UNIT_KIND.ASSERTION),
    ),
    constraint: PROBE_SLUG_CONSTRAINT,
  },
  conditional(
    [PROBE_PAYLOAD_FIELD.REASON],
    EVIDENCE_FIELD_VALUE.NON_EMPTY_STRING,
    probeUnitKindCondition(PROBE_UNIT_KIND.UNEXERCISED),
  ),
];

const PROBE_FINDING_FIELDS: readonly EvidencePayloadField[] = [
  {
    ...required([PROBE_PAYLOAD_FIELD.ASSERTION_SUBJECT], EVIDENCE_FIELD_VALUE.NON_EMPTY_STRING),
    constraint: PROBE_PATH_CONSTRAINT,
  },
  { ...required([PROBE_PAYLOAD_FIELD.SLUG], EVIDENCE_FIELD_VALUE.NON_EMPTY_STRING), constraint: PROBE_SLUG_CONSTRAINT },
  {
    ...required([PROBE_PAYLOAD_FIELD.ARTIFACT_SUBJECT], EVIDENCE_FIELD_VALUE.NON_EMPTY_STRING),
    constraint: PROBE_PATH_CONSTRAINT,
  },
  required([PROBE_PAYLOAD_FIELD.MESSAGE], EVIDENCE_FIELD_VALUE.NON_EMPTY_STRING),
  required([PROBE_PAYLOAD_FIELD.EVIDENCE], EVIDENCE_FIELD_VALUE.OBJECT),
  required([PROBE_PAYLOAD_FIELD.EVIDENCE, PROBE_PAYLOAD_FIELD.OBSERVED], EVIDENCE_FIELD_VALUE.NON_EMPTY_STRING),
  required([PROBE_PAYLOAD_FIELD.EVIDENCE, PROBE_PAYLOAD_FIELD.EXPECTED], EVIDENCE_FIELD_VALUE.NON_EMPTY_STRING),
];

/**
 * The payload fields of each verification type whose validators the run lifecycle registers. The
 * record is keyed by every verification type, so a type the lifecycle adds has no validators
 * without a description here.
 */
export const EVIDENCE_PAYLOAD_FIELDS: Readonly<Record<VerifyVerificationType, EvidencePayloadFields>> = {
  [VERIFY_VERIFICATION_TYPE.AUDIT]: {
    [VERIFY_EVIDENCE_KIND.SCOPE]: AUDIT_SCOPE_FIELDS,
    [VERIFY_EVIDENCE_KIND.FINDING]: AUDIT_FINDING_FIELDS,
  },
  [VERIFY_VERIFICATION_TYPE.REVIEW]: {
    [VERIFY_EVIDENCE_KIND.SCOPE]: REVIEW_SCOPE_FIELDS,
    [VERIFY_EVIDENCE_KIND.FINDING]: REVIEW_FINDING_FIELDS,
  },
  [VERIFY_VERIFICATION_TYPE.TEST]: {
    [VERIFY_EVIDENCE_KIND.SCOPE]: TEST_SCOPE_FIELDS,
    [VERIFY_EVIDENCE_KIND.FINDING]: TEST_FINDING_FIELDS,
  },
  [VERIFY_VERIFICATION_TYPE.PROBE]: {
    [VERIFY_EVIDENCE_KIND.SCOPE]: PROBE_SCOPE_FIELDS,
    [VERIFY_EVIDENCE_KIND.FINDING]: PROBE_FINDING_FIELDS,
  },
};

/**
 * The type-neutral fields a scope payload of every verification type may carry, and the changed
 * path each accounts for when a changeset run bound to expectations reconciles.
 */
export const SCOPE_ACCOUNTING_FIELDS: readonly (EvidencePayloadField & { readonly accounts: string })[] = [
  {
    ...optional([VERIFY_SCOPE_PAYLOAD_FIELD.JUDGED_PATHS], EVIDENCE_FIELD_VALUE.PATH_ARRAY),
    accounts: "a changed path the head holds",
  },
  {
    ...optional([VERIFY_SCOPE_PAYLOAD_FIELD.JUDGED_DELETIONS], EVIDENCE_FIELD_VALUE.PATH_ARRAY),
    accounts: "a path the changeset deletes",
  },
];

/** The dotted path a validator names a field by. */
export function evidenceFieldName(field: EvidencePayloadField): string {
  return field.path.join(".");
}
