import type { ConfigDescriptor, Result } from "@/config/types";

export const PRECOMMIT_SECTION = "precommit";

export interface PrecommitConfig {
  readonly sourceDirs: readonly string[];
  readonly testPattern: string;
}

export const PRECOMMIT_DEFAULTS: PrecommitConfig = {
  sourceDirs: ["src/"],
  testPattern: ".test.ts",
};

function validate(value: unknown): Result<PrecommitConfig> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, error: `${PRECOMMIT_SECTION} section must be an object` };
  }
  const candidate = value as Record<string, unknown>;

  const sourceDirs = candidate["sourceDirs"] ?? PRECOMMIT_DEFAULTS.sourceDirs;
  if (!Array.isArray(sourceDirs) || !sourceDirs.every((x) => typeof x === "string" && x.length > 0)) {
    return {
      ok: false,
      error: `${PRECOMMIT_SECTION}.sourceDirs must be a non-empty array of non-empty strings`,
    };
  }

  const testPattern = candidate["testPattern"] ?? PRECOMMIT_DEFAULTS.testPattern;
  if (typeof testPattern !== "string" || testPattern.length === 0) {
    return {
      ok: false,
      error: `${PRECOMMIT_SECTION}.testPattern must be a non-empty string`,
    };
  }

  return {
    ok: true,
    value: {
      sourceDirs: sourceDirs as readonly string[],
      testPattern: testPattern as string,
    },
  };
}

export const precommitConfigDescriptor: ConfigDescriptor<PrecommitConfig> = {
  section: PRECOMMIT_SECTION,
  defaults: PRECOMMIT_DEFAULTS,
  validate,
};
