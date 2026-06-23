import { type PathFilterConfig, validatePathFilterConfig } from "@/config/primitives/path-filter";
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
export const VALIDATION_KNIP_SUBSECTION = "knip";
export const VALIDATION_ENABLED_FIELD = "enabled";
export const VALIDATION_PATH_TOOL_SUBSECTIONS = {
  ESLINT: "eslint",
  TYPESCRIPT: "typescript",
  CIRCULAR: "circular",
  KNIP: "knip",
  MARKDOWN: "markdown",
  LITERAL: "literal",
  FORMATTING: "formatting",
} as const;

export type ValidationPathToolSubsection =
  (typeof VALIDATION_PATH_TOOL_SUBSECTIONS)[keyof typeof VALIDATION_PATH_TOOL_SUBSECTIONS];

export type ValidationPathFilterConfig = PathFilterConfig;

export type ValidationToolPathConfig = Partial<Record<ValidationPathToolSubsection, ValidationPathFilterConfig>>;

export type ValidationPathConfig = ValidationPathFilterConfig & ValidationToolPathConfig;

export interface ValidationLiteralConfig {
  readonly enabled: boolean;
  readonly values: LiteralConfig;
}

export interface ValidationKnipConfig {
  readonly enabled: boolean;
}

export interface ValidationConfig {
  readonly paths: ValidationPathConfig;
  readonly literal: ValidationLiteralConfig;
  readonly knip: ValidationKnipConfig;
}

const defaults: ValidationConfig = {
  paths: {},
  literal: {
    enabled: true,
    values: {
      minStringLength: DEFAULT_MIN_STRING_LENGTH,
      minNumberDigits: DEFAULT_MIN_NUMBER_DIGITS,
    },
  },
  knip: {
    enabled: false,
  },
};

function validatePaths(raw: unknown): Result<ValidationPathConfig> {
  const basePath = `${VALIDATION_SECTION}.${VALIDATION_PATHS_SUBSECTION}`;
  const baseResult = validatePathFilterConfig(raw, basePath);
  if (!baseResult.ok) return baseResult;
  const candidate = raw as Record<string, unknown>;
  const toolEntries = Object.values(VALIDATION_PATH_TOOL_SUBSECTIONS).map((tool) => {
    const toolRaw = candidate[tool];
    if (toolRaw === undefined) return [tool, undefined] as const;
    const toolResult = validatePathFilterConfig(toolRaw, `${basePath}.${tool}`);
    return [tool, toolResult] as const;
  });
  const toolConfig: ValidationToolPathConfig = {};
  for (const [tool, toolResult] of toolEntries) {
    if (toolResult === undefined) continue;
    if (!toolResult.ok) return toolResult;
    toolConfig[tool] = toolResult.value;
  }
  return { ok: true, value: { ...baseResult.value, ...toolConfig } };
}

function validateLiteral(raw: unknown): Result<ValidationLiteralConfig> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return {
      ok: false,
      error: `${VALIDATION_SECTION}.${VALIDATION_LITERAL_SUBSECTION} must be an object`,
    };
  }
  const candidate = raw as Record<string, unknown>;
  const enabledRaw = candidate[VALIDATION_ENABLED_FIELD] ?? defaults.literal.enabled;
  if (typeof enabledRaw !== "boolean") {
    return {
      ok: false,
      error: `${VALIDATION_SECTION}.${VALIDATION_LITERAL_SUBSECTION}.${VALIDATION_ENABLED_FIELD} must be a boolean`,
    };
  }
  const valuesRaw = candidate[VALIDATION_LITERAL_VALUES_SUBSECTION] ?? {};
  const valuesResult = literalConfigDescriptor.validate(valuesRaw);
  if (!valuesResult.ok) {
    return {
      ok: false,
      error:
        `${VALIDATION_SECTION}.${VALIDATION_LITERAL_SUBSECTION}.${VALIDATION_LITERAL_VALUES_SUBSECTION}: ${valuesResult.error}`,
    };
  }
  return { ok: true, value: { enabled: enabledRaw, values: valuesResult.value } };
}

function validateKnip(raw: unknown): Result<ValidationKnipConfig> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return {
      ok: false,
      error: `${VALIDATION_SECTION}.${VALIDATION_KNIP_SUBSECTION} must be an object`,
    };
  }
  const candidate = raw as Record<string, unknown>;
  const enabledRaw = candidate[VALIDATION_ENABLED_FIELD] ?? defaults.knip.enabled;
  if (typeof enabledRaw !== "boolean") {
    return {
      ok: false,
      error: `${VALIDATION_SECTION}.${VALIDATION_KNIP_SUBSECTION}.${VALIDATION_ENABLED_FIELD} must be a boolean`,
    };
  }
  return { ok: true, value: { enabled: enabledRaw } };
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

  const knipRaw = candidate[VALIDATION_KNIP_SUBSECTION] ?? {};
  const knipResult = validateKnip(knipRaw);
  if (!knipResult.ok) return knipResult;

  return { ok: true, value: { paths: pathsResult.value, literal: literalResult.value, knip: knipResult.value } };
}

export const validationConfigDescriptor: ConfigDescriptor<ValidationConfig> = {
  section: VALIDATION_SECTION,
  defaults,
  validate,
};
