import { type PathFilterConfig, validatePathFilterConfig } from "@/config/primitives/path-filter";
import type { ConfigDescriptor, Result } from "@/config/types";

export const TESTING_SECTION = "testing";

export const TESTING_CONFIG_FIELDS = {
  PASSING_SCOPE: "passingScope",
} as const;

export interface TestingConfig {
  readonly passingScope: PathFilterConfig;
}

const DEFAULT_PASSING_SCOPE = resolveDefaultPassingScope();

const defaults: TestingConfig = {
  passingScope: DEFAULT_PASSING_SCOPE,
};

function resolveDefaultPassingScope(): PathFilterConfig {
  const result = validatePathFilterConfig(
    {},
    `${TESTING_SECTION}.${TESTING_CONFIG_FIELDS.PASSING_SCOPE}`,
  );
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.value;
}

function validate(value: unknown): Result<TestingConfig> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, error: `${TESTING_SECTION} section must be an object` };
  }

  const candidate = value as Record<string, unknown>;
  const passingScopeRaw = candidate[TESTING_CONFIG_FIELDS.PASSING_SCOPE];
  // Null is an explicit invalid value; only an omitted field receives defaults.
  if (passingScopeRaw === undefined) {
    return { ok: true, value: defaults };
  }

  const passingScopeResult = validatePathFilterConfig(
    passingScopeRaw,
    `${TESTING_SECTION}.${TESTING_CONFIG_FIELDS.PASSING_SCOPE}`,
  );
  if (!passingScopeResult.ok) return passingScopeResult;

  return {
    ok: true,
    value: {
      passingScope: passingScopeResult.value,
    },
  };
}

export const testingConfigDescriptor: ConfigDescriptor<TestingConfig> = {
  section: TESTING_SECTION,
  defaults,
  validate,
};
