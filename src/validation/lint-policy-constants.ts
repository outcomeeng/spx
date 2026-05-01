import * as JSONC from "jsonc-parser";

export const LINT_POLICY_MANIFESTS = {
  LEGACY_SPEC_SUFFIX_NODES: {
    file: "eslint.legacy-spec-suffix-nodes.json",
    key: "legacySpecSuffixNodes",
  },
  TEST_LINT_DEBT_NODES: {
    file: "eslint.test-lint-debt-nodes.json",
    key: "testLintDebtNodes",
  },
} as const;

export const LINT_POLICY_BASE_REFS = {
  REMOTE_MAIN: "origin/main",
  LOCAL_MAIN: "main",
} as const;

type JsonObject = Record<string, unknown>;

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseLintPolicyManifest(content: string, source: string, key: string): string[] {
  const parsed = JSONC.parse(content) as unknown;

  if (!isJsonObject(parsed)) {
    throw new Error(`${source} must contain a JSON object`);
  }

  const entries = parsed[key];

  if (!Array.isArray(entries)) {
    throw new Error(`${source} must contain a ${key} array`);
  }

  const invalidEntries = entries.filter((entry) => typeof entry !== "string");

  if (invalidEntries.length > 0) {
    throw new Error(`${source} ${key} entries must be strings`);
  }

  return entries as string[];
}
