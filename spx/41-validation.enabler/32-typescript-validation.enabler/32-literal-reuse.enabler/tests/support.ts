import { KIND_REGISTRY } from "@/lib/spec-tree/config";
import { TYPESCRIPT_MARKER } from "@/validation/discovery/index";
import {
  DEFAULT_MIN_NUMBER_DIGITS,
  DEFAULT_MIN_STRING_LENGTH,
  LITERAL_DEFAULTS,
  LITERAL_SECTION,
  type LiteralAllowlistConfig,
} from "@/validation/literal/config";
import {
  LITERAL_TEST_GENERATOR,
  type LiteralReuseFixtureInputs,
  sampleLiteralTestValue,
} from "@testing/generators/literal/literal";
import type { Config, SpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";

export const DETECTOR_OPTIONS_DEFAULTS = {
  minStringLength: DEFAULT_MIN_STRING_LENGTH,
  minNumberDigits: DEFAULT_MIN_NUMBER_DIGITS,
} as const;

export const EMPTY_ALLOWLIST: ReadonlySet<string> = new Set();

export const INTEGRATION_CONFIG: Config = {
  specTree: { kinds: { ...KIND_REGISTRY } },
  [LITERAL_SECTION]: LITERAL_DEFAULTS,
};

export function configWithAllowlist(allowlist: LiteralAllowlistConfig): Config {
  return {
    ...INTEGRATION_CONFIG,
    [LITERAL_SECTION]: { ...LITERAL_DEFAULTS, allowlist },
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

export async function writeLiteralOutputFixture(
  env: SpecTreeEnv,
): Promise<LiteralReuseFixtureInputs> {
  const inputs = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.reuseFixtureInputs());
  await env.writeRaw(TYPESCRIPT_MARKER, "{}\n");
  await writeSourceWithLiteral(env, inputs.reuseSourceFile, inputs.reuseLiteral);
  await writeTestWithLiteral(env, inputs.reuseTestFile, inputs.reuseLiteral);
  await writeTestWithLiteral(env, inputs.dupeFirstTestFile, inputs.dupeLiteral);
  await writeTestWithLiteral(env, inputs.dupeSecondTestFile, inputs.dupeLiteral);
  return inputs;
}
