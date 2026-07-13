import type { ConfigDescriptor, Result } from "@/config/types";

export const METHODOLOGY_SECTION = "methodology";

export const METHODOLOGY_CONFIG_FIELDS = {
  SOURCE: "source",
  VERSION: "version",
} as const;

export const DEFAULT_METHODOLOGY_SOURCE = "outcomeeng/spec-tree";
export const DEFAULT_METHODOLOGY_VERSION = "installed";

export interface MethodologyConfig {
  readonly source: string;
  readonly version: string;
}

export type MethodologyIdentity = MethodologyConfig;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rejectUnknownFields(
  path: string,
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
): Result<undefined> {
  const unknownFields = Object.keys(value).filter((field) => !allowed.has(field));
  if (unknownFields.length === 1) {
    return { ok: false, error: `${path}.${unknownFields[0]} is not a recognized config field` };
  }
  if (unknownFields.length > 1) {
    return { ok: false, error: `${path} has unrecognized config fields: ${unknownFields.join(", ")}` };
  }
  return { ok: true, value: undefined };
}

function validateNonEmptyString(path: string, value: unknown): Result<string> {
  if (typeof value !== "string" || value.length === 0) {
    return { ok: false, error: `${path} must be a non-empty string` };
  }
  return { ok: true, value };
}

const METHODOLOGY_ALLOWED_FIELDS = new Set<string>(Object.values(METHODOLOGY_CONFIG_FIELDS));
const METHODOLOGY_SOURCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Whether a methodology source is a canonical owner/repository identifier. */
export function isMethodologySource(value: string): boolean {
  return METHODOLOGY_SOURCE_PATTERN.test(value);
}

export const DEFAULT_METHODOLOGY_CONFIG: MethodologyConfig = {
  source: DEFAULT_METHODOLOGY_SOURCE,
  version: DEFAULT_METHODOLOGY_VERSION,
};

function validateMethodologySource(path: string, value: unknown): Result<string> {
  const source = validateNonEmptyString(path, value);
  if (!source.ok) return source;
  if (!isMethodologySource(source.value)) {
    return { ok: false, error: `${path} must be an owner/repository identifier` };
  }
  return source;
}

export function validateMethodologyConfig(value: unknown): Result<MethodologyConfig> {
  if (!isRecord(value)) {
    return { ok: false, error: `${METHODOLOGY_SECTION} section must be an object` };
  }

  const unknown = rejectUnknownFields(METHODOLOGY_SECTION, value, METHODOLOGY_ALLOWED_FIELDS);
  if (!unknown.ok) return unknown;

  const sourceRaw = value[METHODOLOGY_CONFIG_FIELDS.SOURCE];
  const source = sourceRaw === undefined
    ? { ok: true as const, value: DEFAULT_METHODOLOGY_CONFIG.source }
    : validateMethodologySource(`${METHODOLOGY_SECTION}.${METHODOLOGY_CONFIG_FIELDS.SOURCE}`, sourceRaw);
  if (!source.ok) return source;

  const versionRaw = value[METHODOLOGY_CONFIG_FIELDS.VERSION];
  const version = versionRaw === undefined
    ? { ok: true as const, value: DEFAULT_METHODOLOGY_CONFIG.version }
    : validateNonEmptyString(`${METHODOLOGY_SECTION}.${METHODOLOGY_CONFIG_FIELDS.VERSION}`, versionRaw);
  if (!version.ok) return version;

  return { ok: true, value: { source: source.value, version: version.value } };
}

export function resolveMethodologyIdentity(config: MethodologyConfig): MethodologyIdentity {
  return config;
}

export const methodologyConfigDescriptor: ConfigDescriptor<MethodologyConfig> = {
  section: METHODOLOGY_SECTION,
  defaults: DEFAULT_METHODOLOGY_CONFIG,
  validate: validateMethodologyConfig,
};
