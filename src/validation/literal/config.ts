import type { ConfigDescriptor, Result } from "@/config/types";

export const LITERAL_SECTION = "literal";
export const DEFAULT_MIN_STRING_LENGTH = 4;
export const DEFAULT_MIN_NUMBER_DIGITS = 4;

export interface LiteralAllowlistConfig {
  readonly presets?: readonly string[];
  readonly include?: readonly string[];
  readonly exclude?: readonly string[];
}

export interface LiteralConfig {
  readonly allowlist: LiteralAllowlistConfig;
  readonly minStringLength: number;
  readonly minNumberDigits: number;
}

const WEB_PRESET: ReadonlySet<string> = new Set([
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
]);

const PRESET_REGISTRY: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["web", WEB_PRESET],
]);

export function resolveAllowlist(config: LiteralAllowlistConfig): ReadonlySet<string> {
  const effective = new Set<string>();

  for (const presetId of config.presets ?? []) {
    const preset = PRESET_REGISTRY.get(presetId);
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

const defaults: LiteralConfig = {
  allowlist: {},
  minStringLength: DEFAULT_MIN_STRING_LENGTH,
  minNumberDigits: DEFAULT_MIN_NUMBER_DIGITS,
};

function validate(value: unknown): Result<LiteralConfig> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, error: `${LITERAL_SECTION} section must be an object` };
  }
  const candidate = value as Record<string, unknown>;

  const allowlistRaw = candidate["allowlist"] ?? {};
  const allowlistResult = validateAllowlist(allowlistRaw);
  if (!allowlistResult.ok) {
    return allowlistResult;
  }

  const minStringLength = candidate["minStringLength"] ?? defaults.minStringLength;
  if (typeof minStringLength !== "number" || !Number.isInteger(minStringLength) || minStringLength < 0) {
    return {
      ok: false,
      error: `${LITERAL_SECTION}.minStringLength must be a non-negative integer`,
    };
  }

  const minNumberDigits = candidate["minNumberDigits"] ?? defaults.minNumberDigits;
  if (typeof minNumberDigits !== "number" || !Number.isInteger(minNumberDigits) || minNumberDigits < 0) {
    return {
      ok: false,
      error: `${LITERAL_SECTION}.minNumberDigits must be a non-negative integer`,
    };
  }

  return { ok: true, value: { allowlist: allowlistResult.value, minStringLength, minNumberDigits } };
}

function validateAllowlist(raw: unknown): Result<LiteralAllowlistConfig> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, error: `${LITERAL_SECTION}.allowlist must be an object` };
  }
  const candidate = raw as Record<string, unknown>;

  const presets = candidate["presets"];
  if (presets !== undefined) {
    if (!Array.isArray(presets) || !presets.every((x) => typeof x === "string")) {
      return { ok: false, error: `${LITERAL_SECTION}.allowlist.presets must be an array of strings` };
    }
    for (const id of presets as string[]) {
      if (!PRESET_REGISTRY.has(id)) {
        return { ok: false, error: `${LITERAL_SECTION}.allowlist.presets: unrecognized preset "${id}"` };
      }
    }
  }

  const include = candidate["include"];
  if (include !== undefined && (!Array.isArray(include) || !include.every((x) => typeof x === "string"))) {
    return { ok: false, error: `${LITERAL_SECTION}.allowlist.include must be an array of strings` };
  }

  const exclude = candidate["exclude"];
  if (exclude !== undefined && (!Array.isArray(exclude) || !exclude.every((x) => typeof x === "string"))) {
    return { ok: false, error: `${LITERAL_SECTION}.allowlist.exclude must be an array of strings` };
  }

  return {
    ok: true,
    value: {
      presets: presets as readonly string[] | undefined,
      include: include as readonly string[] | undefined,
      exclude: exclude as readonly string[] | undefined,
    },
  };
}

export const literalConfigDescriptor: ConfigDescriptor<LiteralConfig> = {
  section: LITERAL_SECTION,
  defaults,
  validate,
};
