import { type PathFilterConfig, validatePathFilterConfig } from "@/config/primitives/path-filter";
import type { ConfigDescriptor, Result } from "@/config/types";

export const AUDIT_SECTION = "audit";

export const AUDIT_CONFIG_FIELDS = {
  STORAGE: "storage",
  SPX_DIR: "spxDir",
  NODES_DIR: "nodesDir",
  VERDICT_FILE: "verdictFile",
  VERDICT_FILE_SUFFIX: "verdictFileSuffix",
  BASE_REF: "baseRef",
  AUDITORS: "auditors",
  TARGETS: "targets",
} as const;

export interface AuditStorageConfig {
  readonly spxDir: string;
  readonly nodesDir: string;
  readonly verdictFile: string;
  readonly verdictFileSuffix: string;
}

type MutableAuditStorageConfig = {
  -readonly [Field in keyof AuditStorageConfig]: string;
};

export interface AuditConfig {
  readonly storage: AuditStorageConfig;
  readonly baseRef: string;
  readonly auditors: readonly string[];
  readonly targets: PathFilterConfig;
}

export const DEFAULT_AUDIT_CONFIG: AuditConfig = {
  storage: {
    spxDir: ".spx",
    nodesDir: "nodes",
    verdictFile: "verdict.audit.xml",
    verdictFileSuffix: ".audit.xml",
  },
  baseRef: "main",
  auditors: [],
  targets: resolveDefaultTargets(),
};

const AUDIT_ALLOWED_FIELDS = new Set<string>([
  AUDIT_CONFIG_FIELDS.STORAGE,
  AUDIT_CONFIG_FIELDS.BASE_REF,
  AUDIT_CONFIG_FIELDS.AUDITORS,
  AUDIT_CONFIG_FIELDS.TARGETS,
]);

const AUDIT_STORAGE_ALLOWED_FIELDS = new Set<string>([
  AUDIT_CONFIG_FIELDS.SPX_DIR,
  AUDIT_CONFIG_FIELDS.NODES_DIR,
  AUDIT_CONFIG_FIELDS.VERDICT_FILE,
  AUDIT_CONFIG_FIELDS.VERDICT_FILE_SUFFIX,
]);

const PATH_SEPARATOR = "/";
const ENCODED_SEPARATOR = "-";

export const auditConfigDescriptor: ConfigDescriptor<AuditConfig> = {
  section: AUDIT_SECTION,
  defaults: DEFAULT_AUDIT_CONFIG,
  validate: validateAuditConfig,
};

export function encodeNodePath(nodePath: string): string {
  return nodePath.replaceAll(PATH_SEPARATOR, ENCODED_SEPARATOR);
}

export function formatAuditTimestamp(now?: () => Date): string {
  const date = (now ?? (() => new Date()))();

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");

  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
}

function resolveDefaultTargets(): PathFilterConfig {
  const result = validatePathFilterConfig(
    {},
    `${AUDIT_SECTION}.${AUDIT_CONFIG_FIELDS.TARGETS}`,
  );
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

function validateAuditConfig(raw: unknown): Result<AuditConfig> {
  if (!isRecord(raw)) {
    return { ok: false, error: `${AUDIT_SECTION} section must be an object` };
  }

  const unknown = rejectUnknownFields(AUDIT_SECTION, raw, AUDIT_ALLOWED_FIELDS);
  if (!unknown.ok) return unknown;

  const storage = raw[AUDIT_CONFIG_FIELDS.STORAGE] === undefined
    ? { ok: true as const, value: DEFAULT_AUDIT_CONFIG.storage }
    : validateStorage(raw[AUDIT_CONFIG_FIELDS.STORAGE]);
  if (!storage.ok) return storage;

  const baseRef = raw[AUDIT_CONFIG_FIELDS.BASE_REF] === undefined
    ? { ok: true as const, value: DEFAULT_AUDIT_CONFIG.baseRef }
    : validateNonEmptyString(
      `${AUDIT_SECTION}.${AUDIT_CONFIG_FIELDS.BASE_REF}`,
      raw[AUDIT_CONFIG_FIELDS.BASE_REF],
    );
  if (!baseRef.ok) return baseRef;

  const auditors = raw[AUDIT_CONFIG_FIELDS.AUDITORS] === undefined
    ? { ok: true as const, value: DEFAULT_AUDIT_CONFIG.auditors }
    : validateArrayOfNonEmptyStrings(
      `${AUDIT_SECTION}.${AUDIT_CONFIG_FIELDS.AUDITORS}`,
      raw[AUDIT_CONFIG_FIELDS.AUDITORS],
    );
  if (!auditors.ok) return auditors;

  const targets = raw[AUDIT_CONFIG_FIELDS.TARGETS] === undefined
    ? { ok: true as const, value: DEFAULT_AUDIT_CONFIG.targets }
    : validatePathFilterConfig(
      raw[AUDIT_CONFIG_FIELDS.TARGETS],
      `${AUDIT_SECTION}.${AUDIT_CONFIG_FIELDS.TARGETS}`,
    );
  if (!targets.ok) return targets;

  return {
    ok: true,
    value: {
      storage: storage.value,
      baseRef: baseRef.value,
      auditors: auditors.value,
      targets: targets.value,
    },
  };
}

function validateStorage(raw: unknown): Result<AuditStorageConfig> {
  if (!isRecord(raw)) {
    return { ok: false, error: `${AUDIT_SECTION}.${AUDIT_CONFIG_FIELDS.STORAGE} must be an object` };
  }
  const unknown = rejectUnknownFields(
    `${AUDIT_SECTION}.${AUDIT_CONFIG_FIELDS.STORAGE}`,
    raw,
    AUDIT_STORAGE_ALLOWED_FIELDS,
  );
  if (!unknown.ok) return unknown;

  return validateStringRecord(
    `${AUDIT_SECTION}.${AUDIT_CONFIG_FIELDS.STORAGE}`,
    DEFAULT_AUDIT_CONFIG.storage,
    raw,
  );
}

function validateStringRecord(
  path: string,
  defaults: AuditStorageConfig,
  raw: Record<string, unknown>,
): Result<AuditStorageConfig> {
  const next: MutableAuditStorageConfig = { ...defaults };
  // Unknown fields are rejected before this default merge.
  for (const field of Object.keys(defaults)) {
    const value = raw[field];
    if (value === undefined) continue;
    const validated = validateNonEmptyString(`${path}.${field}`, value);
    if (!validated.ok) return validated;
    next[field as keyof AuditStorageConfig] = validated.value;
  }
  return { ok: true, value: next };
}

function validateNonEmptyString(path: string, value: unknown): Result<string> {
  if (typeof value !== "string" || value.length === 0) {
    return { ok: false, error: `${path} must be a non-empty string` };
  }
  return { ok: true, value };
}

function validateArrayOfNonEmptyStrings(path: string, value: unknown): Result<readonly string[]> {
  if (!Array.isArray(value)) {
    return { ok: false, error: `${path} must be an array of non-empty strings` };
  }
  const entries: string[] = [];
  for (const [index, entry] of value.entries()) {
    const validated = validateNonEmptyString(`${path}.${index}`, entry);
    if (!validated.ok) return validated;
    entries.push(validated.value);
  }
  return { ok: true, value: entries };
}

function rejectUnknownFields(
  path: string,
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
): Result<undefined> {
  const unknownField = Object.keys(value).find((field) => !allowed.has(field));
  if (unknownField !== undefined) {
    return { ok: false, error: `${path}.${unknownField} is not a recognized config field` };
  }
  return { ok: true, value: undefined };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
