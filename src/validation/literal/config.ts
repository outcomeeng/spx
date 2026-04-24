import type { ConfigDescriptor, Result } from "@/config/types.js";

export const LITERAL_REUSE_SECTION = "literalReuse";
export const DEFAULT_MIN_STRING_LENGTH = 4;
export const DEFAULT_MIN_NUMBER_DIGITS = 4;

export interface LiteralReuseConfig {
  readonly allowlist: readonly string[];
  readonly minStringLength: number;
  readonly minNumberDigits: number;
}

const defaults: LiteralReuseConfig = {
  allowlist: [],
  minStringLength: DEFAULT_MIN_STRING_LENGTH,
  minNumberDigits: DEFAULT_MIN_NUMBER_DIGITS,
};

function validate(value: unknown): Result<LiteralReuseConfig> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, error: `${LITERAL_REUSE_SECTION} section must be an object` };
  }
  const candidate = value as Partial<LiteralReuseConfig>;

  const allowlist = candidate.allowlist ?? defaults.allowlist;
  if (!Array.isArray(allowlist) || !allowlist.every((x) => typeof x === "string")) {
    return {
      ok: false,
      error: `${LITERAL_REUSE_SECTION}.allowlist must be an array of strings`,
    };
  }

  const minStringLength = candidate.minStringLength ?? defaults.minStringLength;
  if (typeof minStringLength !== "number" || !Number.isInteger(minStringLength) || minStringLength < 0) {
    return {
      ok: false,
      error: `${LITERAL_REUSE_SECTION}.minStringLength must be a non-negative integer`,
    };
  }

  const minNumberDigits = candidate.minNumberDigits ?? defaults.minNumberDigits;
  if (typeof minNumberDigits !== "number" || !Number.isInteger(minNumberDigits) || minNumberDigits < 0) {
    return {
      ok: false,
      error: `${LITERAL_REUSE_SECTION}.minNumberDigits must be a non-negative integer`,
    };
  }

  return { ok: true, value: { allowlist, minStringLength, minNumberDigits } };
}

export const literalReuseConfigDescriptor: ConfigDescriptor<LiteralReuseConfig> = {
  section: LITERAL_REUSE_SECTION,
  defaults,
  validate,
};
