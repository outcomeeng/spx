import type { ConfigDescriptor, Result } from "@/config/types";

export const LITERAL_SECTION = "literal";
export const DEFAULT_MIN_STRING_LENGTH = 4;
export const DEFAULT_MIN_NUMBER_DIGITS = 4;
export const LEGACY_LITERAL_ALLOWLIST_FIELD = "allowlist";
export const LEGACY_LITERAL_ALLOWLIST_ERROR =
  "validation.literal.values.allowlist is no longer valid; move its contents up one level to validation.literal.values.{presets,include,exclude}";

export interface LiteralValueAllowlistConfig {
  readonly presets?: readonly string[];
  readonly include?: readonly string[];
  readonly exclude?: readonly string[];
}

export interface LiteralConfig extends LiteralValueAllowlistConfig {
  readonly minStringLength: number;
  readonly minNumberDigits: number;
}

export const PRESET_NAMES = {
  WEB: "web",
} as const;

export type PresetName = (typeof PRESET_NAMES)[keyof typeof PRESET_NAMES];

export const WEB_PRESET_TOKENS = [
  "GET",
  "POST",
  "PUT",
  "DELETE",
  "PATCH",
  "Content-Type",
  "Authorization",
  "Accept",
  "status",
  "message",
  "error",
  "data",
  "class",
  "id",
  "href",
  "src",
  "type",
  "name",
  "value",
] as const;

export type WebPresetToken = (typeof WEB_PRESET_TOKENS)[number];

const WEB_PRESET: ReadonlySet<WebPresetToken> = new Set(WEB_PRESET_TOKENS);

const PRESET_REGISTRY: ReadonlyMap<PresetName, ReadonlySet<string>> = new Map([
  [PRESET_NAMES.WEB, WEB_PRESET],
]);

export function resolveAllowlist(config: LiteralValueAllowlistConfig): ReadonlySet<string> {
  const effective = new Set<string>();

  for (const presetId of config.presets ?? []) {
    const preset = PRESET_REGISTRY.get(presetId as PresetName);
    if (preset !== undefined) {
      for (const v of preset) effective.add(v);
    }
  }

  for (const v of config.include ?? []) {
    effective.add(v);
  }

  for (const v of config.exclude ?? []) {
    effective.delete(v);
  }

  return effective;
}

export const LITERAL_DEFAULTS: LiteralConfig = {
  minStringLength: DEFAULT_MIN_STRING_LENGTH,
  minNumberDigits: DEFAULT_MIN_NUMBER_DIGITS,
};

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function validate(value: unknown): Result<LiteralConfig> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, error: `${LITERAL_SECTION} section must be an object` };
  }
  const candidate = value as Record<string, unknown>;

  if (candidate[LEGACY_LITERAL_ALLOWLIST_FIELD] !== undefined) {
    return { ok: false, error: LEGACY_LITERAL_ALLOWLIST_ERROR };
  }

  const presets = candidate["presets"];
  if (presets !== undefined) {
    if (!isStringArray(presets)) {
      return { ok: false, error: `${LITERAL_SECTION}.presets must be an array of strings` };
    }
    const unknownPreset = presets.find((id) => !PRESET_REGISTRY.has(id as PresetName));
    if (unknownPreset !== undefined) {
      return { ok: false, error: `${LITERAL_SECTION}.presets: unrecognized preset "${unknownPreset}"` };
    }
  }

  const include = candidate["include"];
  if (include !== undefined && !isStringArray(include)) {
    return { ok: false, error: `${LITERAL_SECTION}.include must be an array of strings` };
  }

  const exclude = candidate["exclude"];
  if (exclude !== undefined && !isStringArray(exclude)) {
    return { ok: false, error: `${LITERAL_SECTION}.exclude must be an array of strings` };
  }

  const minStringLength = candidate["minStringLength"] ?? LITERAL_DEFAULTS.minStringLength;
  if (!isNonNegativeInteger(minStringLength)) {
    return {
      ok: false,
      error: `${LITERAL_SECTION}.minStringLength must be a non-negative integer`,
    };
  }

  const minNumberDigits = candidate["minNumberDigits"] ?? LITERAL_DEFAULTS.minNumberDigits;
  if (!isNonNegativeInteger(minNumberDigits)) {
    return {
      ok: false,
      error: `${LITERAL_SECTION}.minNumberDigits must be a non-negative integer`,
    };
  }

  return {
    ok: true,
    value: {
      presets: presets,
      include: include,
      exclude: exclude,
      minStringLength,
      minNumberDigits,
    },
  };
}

export const literalConfigDescriptor: ConfigDescriptor<LiteralConfig> = {
  section: LITERAL_SECTION,
  defaults: LITERAL_DEFAULTS,
  validate,
};
