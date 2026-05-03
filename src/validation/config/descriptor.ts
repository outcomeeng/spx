import type { ConfigDescriptor, Result } from "@/config/types";
import {
  DEFAULT_MIN_NUMBER_DIGITS,
  DEFAULT_MIN_STRING_LENGTH,
  type LiteralConfig,
  literalConfigDescriptor,
} from "@/validation/literal/config";

export const VALIDATION_SECTION = "validation";
export const VALIDATION_LITERAL_SUBSECTION = "literal";
export const VALIDATION_LITERAL_VALUES_SUBSECTION = "values";
export const VALIDATION_PATHS_SUBSECTION = "paths";

export interface ValidationPathConfig {
  readonly include?: readonly string[];
  readonly exclude?: readonly string[];
}

export interface ValidationLiteralConfig {
  readonly values: LiteralConfig;
}

export interface ValidationConfig {
  readonly paths: ValidationPathConfig;
  readonly literal: ValidationLiteralConfig;
}

const defaults: ValidationConfig = {
  paths: {},
  literal: {
    values: {
      allowlist: {},
      minStringLength: DEFAULT_MIN_STRING_LENGTH,
      minNumberDigits: DEFAULT_MIN_NUMBER_DIGITS,
    },
  },
};

function validatePaths(raw: unknown): Result<ValidationPathConfig> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return {
      ok: false,
      error: `${VALIDATION_SECTION}.${VALIDATION_PATHS_SUBSECTION} must be an object`,
    };
  }
  const candidate = raw as Record<string, unknown>;

  const include = candidate["include"];
  if (
    include !== undefined
    && (!Array.isArray(include) || !include.every((x) => typeof x === "string"))
  ) {
    return {
      ok: false,
      error: `${VALIDATION_SECTION}.${VALIDATION_PATHS_SUBSECTION}.include must be an array of strings`,
    };
  }

  const exclude = candidate["exclude"];
  if (
    exclude !== undefined
    && (!Array.isArray(exclude) || !exclude.every((x) => typeof x === "string"))
  ) {
    return {
      ok: false,
      error: `${VALIDATION_SECTION}.${VALIDATION_PATHS_SUBSECTION}.exclude must be an array of strings`,
    };
  }

  return {
    ok: true,
    value: {
      include: include as readonly string[] | undefined,
      exclude: exclude as readonly string[] | undefined,
    },
  };
}

function validateLiteral(raw: unknown): Result<ValidationLiteralConfig> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return {
      ok: false,
      error: `${VALIDATION_SECTION}.${VALIDATION_LITERAL_SUBSECTION} must be an object`,
    };
  }
  const candidate = raw as Record<string, unknown>;
  const valuesRaw = candidate[VALIDATION_LITERAL_VALUES_SUBSECTION] ?? {};
  const valuesResult = literalConfigDescriptor.validate(valuesRaw);
  if (!valuesResult.ok) {
    return {
      ok: false,
      error:
        `${VALIDATION_SECTION}.${VALIDATION_LITERAL_SUBSECTION}.${VALIDATION_LITERAL_VALUES_SUBSECTION}: ${valuesResult.error}`,
    };
  }
  return { ok: true, value: { values: valuesResult.value } };
}

function validate(value: unknown): Result<ValidationConfig> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, error: `${VALIDATION_SECTION} section must be an object` };
  }
  const candidate = value as Record<string, unknown>;

  const pathsRaw = candidate[VALIDATION_PATHS_SUBSECTION] ?? {};
  const pathsResult = validatePaths(pathsRaw);
  if (!pathsResult.ok) return pathsResult;

  const literalRaw = candidate[VALIDATION_LITERAL_SUBSECTION] ?? {};
  const literalResult = validateLiteral(literalRaw);
  if (!literalResult.ok) return literalResult;

  return { ok: true, value: { paths: pathsResult.value, literal: literalResult.value } };
}

export const validationConfigDescriptor: ConfigDescriptor<ValidationConfig> = {
  section: VALIDATION_SECTION,
  defaults,
  validate,
};
