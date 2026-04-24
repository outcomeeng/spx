import type { Config } from "@/spec/testing/index.js";
import type { SpecTreeEnv } from "@/spec/testing/index.js";

export const MIN_STRING_LENGTH = 4;
export const MIN_NUMBER_DIGITS = 4;
export const EMPTY_ALLOWLIST: ReadonlySet<string> = new Set();

export const DETECTOR_OPTIONS_DEFAULTS = {
  minStringLength: MIN_STRING_LENGTH,
  minNumberDigits: MIN_NUMBER_DIGITS,
} as const;

export const INTEGRATION_CONFIG: Config = {
  specTree: {
    kinds: {
      enabler: { category: "node", suffix: ".enabler" },
      outcome: { category: "node", suffix: ".outcome" },
      adr: { category: "decision", suffix: ".adr.md" },
      pdr: { category: "decision", suffix: ".pdr.md" },
    },
  },
  literalReuse: {
    allowlist: [],
    minStringLength: MIN_STRING_LENGTH,
    minNumberDigits: MIN_NUMBER_DIGITS,
  },
};

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
