import { KIND_REGISTRY } from "@/spec/config";
import type { Config, SpecTreeEnv } from "@/spec/testing/index";
import { TYPESCRIPT_MARKER } from "@/validation/discovery/index";
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

export interface LiteralOutputFixture {
  readonly reuseLiteral: string;
  readonly dupeLiteral: string;
  readonly reuseSourceFile: string;
  readonly reuseTestFile: string;
  readonly dupeFirstTestFile: string;
  readonly dupeSecondTestFile: string;
}

export const outputFixture: LiteralOutputFixture = {
  reuseLiteral: "src-owned-token",
  dupeLiteral: "test-dupe-token",
  reuseSourceFile: "src/reuse.ts",
  reuseTestFile: "tests/reuse.test.ts",
  dupeFirstTestFile: "tests/dupe-a.test.ts",
  dupeSecondTestFile: "tests/dupe-b.test.ts",
};

export function configWithAllowlist(allowlist: LiteralAllowlistConfig): Config {
  return {
    ...INTEGRATION_CONFIG,
    [LITERAL_SECTION]: { ...BASE_LITERAL_CONFIG, allowlist },
  };
}

type LiteralTestFixtureWriter = (
  env: SpecTreeEnv,
  filename: string,
  literal: string,
) => Promise<void>;

const literalTestFixtureWriters = {
  writeSourceWithLiteral: async (env, filename, literal) => {
    await env.writeRaw(filename, `export const V = "${literal}";\n`);
  },
  writeTestWithLiteral: async (env, filename, literal) => {
    await env.writeRaw(filename, `expect(v).toBe("${literal}");\n`);
  },
} as const satisfies Record<string, LiteralTestFixtureWriter>;

export const literalTestFixtureWriterMethods = Object.keys(literalTestFixtureWriters);
export const { writeSourceWithLiteral, writeTestWithLiteral } = literalTestFixtureWriters;

export async function writeLiteralOutputFixture(env: SpecTreeEnv): Promise<LiteralOutputFixture> {
  await env.writeRaw(TYPESCRIPT_MARKER, "{}\n");
  await writeSourceWithLiteral(env, outputFixture.reuseSourceFile, outputFixture.reuseLiteral);
  await writeTestWithLiteral(env, outputFixture.reuseTestFile, outputFixture.reuseLiteral);
  await writeTestWithLiteral(env, outputFixture.dupeFirstTestFile, outputFixture.dupeLiteral);
  await writeTestWithLiteral(env, outputFixture.dupeSecondTestFile, outputFixture.dupeLiteral);
  return outputFixture;
}
