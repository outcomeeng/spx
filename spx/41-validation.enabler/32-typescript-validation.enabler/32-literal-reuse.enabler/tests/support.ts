import { KIND_REGISTRY } from "@/spec/config";
import type { Config, SpecTreeEnv } from "@/spec/testing/index";
import { LITERAL_SECTION, type LiteralAllowlistConfig, type LiteralConfig } from "@/validation/literal/config";

export const MIN_STRING_LENGTH = 4;
export const MIN_NUMBER_DIGITS = 4;
export const EMPTY_ALLOWLIST: ReadonlySet<string> = new Set();

export const DETECTOR_OPTIONS_DEFAULTS = {
  minStringLength: MIN_STRING_LENGTH,
  minNumberDigits: MIN_NUMBER_DIGITS,
} as const;

const BASE_LITERAL_CONFIG: LiteralConfig = {
  allowlist: {},
  minStringLength: MIN_STRING_LENGTH,
  minNumberDigits: MIN_NUMBER_DIGITS,
};

export const INTEGRATION_CONFIG: Config = {
  specTree: { kinds: { ...KIND_REGISTRY } },
  [LITERAL_SECTION]: BASE_LITERAL_CONFIG,
};

export function configWithAllowlist(allowlist: LiteralAllowlistConfig): Config {
  return {
    ...INTEGRATION_CONFIG,
    [LITERAL_SECTION]: { ...BASE_LITERAL_CONFIG, allowlist },
  };
}

export async function writeSourceWithLiteral(
  env: SpecTreeEnv,
  filename: string,
  literal: string,
): Promise<void> {
  await env.writeRaw(filename, `export const V = "${literal}";\n`);
}

export async function writeTestWithLiteral(
  env: SpecTreeEnv,
  filename: string,
  literal: string,
): Promise<void> {
  await env.writeRaw(filename, `expect(v).toBe("${literal}");\n`);
}
