import type { ConfigDescriptor, Result } from "@/config/types";

export const METHODOLOGY_SECTION = "methodology";

export const METHODOLOGY_CONFIG_FIELDS = {
  SOURCE: "source",
  VERSION: "version",
  MIGRATING_FROM: "migratingFrom",
} as const;

export const DEFAULT_METHODOLOGY_SOURCE = "outcomeeng/methodology";

const NUMERIC_COMPONENT = String.raw`(0|[1-9]\d*)`;
const IDENTIFIER_RUN = "[0-9A-Za-z.-]+";

/** An exact SemVer methodology version: `MAJOR.MINOR.PATCH` with optional prerelease and build metadata. */
export const METHODOLOGY_VERSION_PATTERN = new RegExp(
  String
    .raw`^${NUMERIC_COMPONENT}\.${NUMERIC_COMPONENT}\.${NUMERIC_COMPONENT}(?:-${IDENTIFIER_RUN})?(?:\+${IDENTIFIER_RUN})?$`,
);

/** A methodology line: `MAJOR.MINOR`, the shape of a shipped tree directory name. */
export const METHODOLOGY_LINE_PATTERN = new RegExp(String.raw`^${NUMERIC_COMPONENT}\.${NUMERIC_COMPONENT}$`);

/** Whether `value` is an exact methodology version. */
export function isMethodologyVersion(value: string): boolean {
  return METHODOLOGY_VERSION_PATTERN.test(value);
}

/** Diagnostic for a methodology field whose value is not an exact version; no sentinel stands in for one. */
export function formatMethodologyVersionInvalidError(path: string, version: string): string {
  return `${path} must be an exact MAJOR.MINOR.PATCH methodology version; rejected ${JSON.stringify(version)}`;
}

export interface MethodologyConfig {
  /** The repository the methodology is published from, as `owner/repository`. */
  readonly source: string;
  /** The methodology version the product targets; absent until the product declares one. */
  readonly version?: string;
  /** The methodology version the product migrates from; present only while a migration window is open. */
  readonly migratingFrom?: string;
}

export interface MethodologyIdentity {
  readonly source: string;
  /** Absent when the product declares no methodology version; no sentinel stands in for one. */
  readonly version?: string;
  /** The version the product migrates from, present only while a migration window is open. */
  readonly migratingFrom?: string;
}

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

export const DEFAULT_METHODOLOGY_CONFIG: MethodologyConfig = {
  source: DEFAULT_METHODOLOGY_SOURCE,
};

/** Diagnostic for a methodology identity requested by a product that declares no methodology version. */
export function formatMethodologyVersionUndeclaredError(): string {
  return `No methodology version is declared; set ${METHODOLOGY_SECTION}.${METHODOLOGY_CONFIG_FIELDS.VERSION}`;
}

function validateMethodologySource(path: string, value: unknown): Result<string> {
  const source = validateNonEmptyString(path, value);
  if (!source.ok) return source;
  if (!METHODOLOGY_SOURCE_PATTERN.test(source.value)) {
    return { ok: false, error: `${path} must be an owner/repository identifier` };
  }
  return source;
}

function validateOptionalVersion(field: string, raw: unknown): Result<string | undefined> {
  if (raw === undefined) return { ok: true, value: undefined };
  const path = `${METHODOLOGY_SECTION}.${field}`;
  const text = validateNonEmptyString(path, raw);
  if (!text.ok) return text;
  if (!isMethodologyVersion(text.value)) {
    return { ok: false, error: formatMethodologyVersionInvalidError(path, text.value) };
  }
  return text;
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

  const version = validateOptionalVersion(
    METHODOLOGY_CONFIG_FIELDS.VERSION,
    value[METHODOLOGY_CONFIG_FIELDS.VERSION],
  );
  if (!version.ok) return version;

  const migratingFrom = validateOptionalVersion(
    METHODOLOGY_CONFIG_FIELDS.MIGRATING_FROM,
    value[METHODOLOGY_CONFIG_FIELDS.MIGRATING_FROM],
  );
  if (!migratingFrom.ok) return migratingFrom;

  return {
    ok: true,
    value: {
      source: source.value,
      ...(version.value === undefined ? {} : { version: version.value }),
      ...(migratingFrom.value === undefined ? {} : { migratingFrom: migratingFrom.value }),
    },
  };
}

/** The product's methodology identity, carrying the declared version when the product declares one. */
export function resolveMethodologyIdentity(config: MethodologyConfig): MethodologyIdentity {
  return {
    source: config.source,
    ...(config.version === undefined ? {} : { version: config.version }),
    ...(config.migratingFrom === undefined ? {} : { migratingFrom: config.migratingFrom }),
  };
}

/**
 * The declared methodology version, required by consumers that address a committed
 * methodology tree. A product that declares none has nothing to address, and no
 * sentinel stands in for one because nothing installs a methodology to fall back to.
 */
export function requireMethodologyVersion(config: MethodologyConfig): Result<string> {
  return config.version === undefined
    ? { ok: false, error: formatMethodologyVersionUndeclaredError() }
    : { ok: true, value: config.version };
}

export const methodologyConfigDescriptor: ConfigDescriptor<MethodologyConfig> = {
  section: METHODOLOGY_SECTION,
  defaults: DEFAULT_METHODOLOGY_CONFIG,
  validate: validateMethodologyConfig,
};
