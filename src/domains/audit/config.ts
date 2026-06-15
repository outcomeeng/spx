import { type PathFilterConfig, validatePathFilterConfig } from "@/config/primitives/path-filter";
import type { ConfigDescriptor, Result } from "@/config/types";

export const AUDIT_SECTION = "audit";

export const AUDIT_CONFIG_FIELDS = {
  BASE_REF: "baseRef",
  AUDITORS: "auditors",
  TARGETS: "targets",
} as const;

export interface AuditConfig {
  readonly baseRef: string;
  readonly auditors: readonly string[];
  readonly targets: PathFilterConfig;
}

export const DEFAULT_AUDIT_CONFIG: AuditConfig = {
  baseRef: "main",
  auditors: [],
  targets: resolveDefaultTargets(),
};

const AUDIT_ALLOWED_FIELDS = new Set<string>([
  AUDIT_CONFIG_FIELDS.BASE_REF,
  AUDIT_CONFIG_FIELDS.AUDITORS,
  AUDIT_CONFIG_FIELDS.TARGETS,
]);

export const auditConfigDescriptor: ConfigDescriptor<AuditConfig> = {
  section: AUDIT_SECTION,
  defaults: DEFAULT_AUDIT_CONFIG,
  validate: validateAuditConfig,
};

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
      baseRef: baseRef.value,
      auditors: auditors.value,
      targets: targets.value,
    },
  };
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
