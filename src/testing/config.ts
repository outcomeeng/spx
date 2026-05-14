import { type PathFilterConfig, validatePathFilterConfig } from "@/config/primitives/path-filter";
import type { ConfigDescriptor, Result } from "@/config/types";

export const TESTING_SECTION = "testing";

export const TESTING_CONFIG_FIELDS = {
  PASSING_SCOPE: "passingScope",
} as const;

export type TestingPassingScopeConfig = PathFilterConfig;

export interface TestingConfig {
  readonly passingScope: TestingPassingScopeConfig;
}

export const TESTING_CONFIG_DEFAULTS: TestingConfig = {
  passingScope: {},
};

function validate(value: unknown): Result<TestingConfig> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, error: `${TESTING_SECTION} section must be an object` };
  }

  const candidate = value as Record<string, unknown>;
  const passingScopeRaw = candidate[TESTING_CONFIG_FIELDS.PASSING_SCOPE] === undefined
    ? {}
    : candidate[TESTING_CONFIG_FIELDS.PASSING_SCOPE];
  const passingScopeResult = validatePathFilterConfig(
    passingScopeRaw,
    `${TESTING_SECTION}.${TESTING_CONFIG_FIELDS.PASSING_SCOPE}`,
  );
  if (!passingScopeResult.ok) return passingScopeResult;

  return {
    ok: true,
    value: {
      [TESTING_CONFIG_FIELDS.PASSING_SCOPE]: passingScopeResult.value,
    },
  };
}

export const testingConfigDescriptor: ConfigDescriptor<TestingConfig> = {
  section: TESTING_SECTION,
  defaults: TESTING_CONFIG_DEFAULTS,
  validate,
};
