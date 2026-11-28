import type { Linter } from "eslint";
import { ESLint } from "eslint";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { MIRROR_RULES } from "@eslint-rules/offline-mirror";

const REPO_ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const SPEC_TREE_LINT_FIXTURES_ROOT = resolve(REPO_ROOT, "testing/fixtures/spec-tree");
const ESLINT_ERROR_SEVERITY: Linter.Severity = 2;

// `lintText` lints a fixture at a product path the TypeScript project service does
// not know, so the type-aware mirror rules are off for this instance; every
// syntactic rule of the product configuration still runs.
const SYNTACTIC_PRODUCT_OVERRIDE: Linter.Config = {
  languageOptions: { parserOptions: { projectService: false } },
  rules: Object.fromEntries(
    Object.keys(MIRROR_RULES).map((rule): [string, Linter.RuleEntry] => [rule, "off"]),
  ),
};

/** Inert whole-file payloads that cross, or stay inside, the spec-tree library import boundary. */
export const SPEC_TREE_IMPORT_BOUNDARY_FIXTURES = {
  PUBLIC_SURFACE_CONSUMER: resolve(SPEC_TREE_LINT_FIXTURES_ROOT, "import-boundary/public-surface-consumer.ts"),
  INTERNAL_MODULE_CONSUMER: resolve(SPEC_TREE_LINT_FIXTURES_ROOT, "import-boundary/internal-module-consumer.ts"),
} as const;

/** Inert whole-file spec-tree test payloads that inject the source explicitly or intercept a module. */
export const SPEC_TREE_MODULE_INTERCEPTION_FIXTURES = {
  INJECTED_SOURCE: resolve(SPEC_TREE_LINT_FIXTURES_ROOT, "module-interception/injected-source.fixture.ts"),
  VI_MOCK: resolve(SPEC_TREE_LINT_FIXTURES_ROOT, "module-interception/vi-mock.fixture.ts"),
  VI_DO_MOCK: resolve(SPEC_TREE_LINT_FIXTURES_ROOT, "module-interception/vi-do-mock.fixture.ts"),
  JEST_MOCK: resolve(SPEC_TREE_LINT_FIXTURES_ROOT, "module-interception/jest-mock.fixture.ts"),
  MEMFS: resolve(SPEC_TREE_LINT_FIXTURES_ROOT, "module-interception/memfs.fixture.ts"),
} as const;

export interface SpecTreeLintErrorObservation {
  readonly ruleId: string | null;
  readonly line: number;
  readonly message: string;
}

let productEslint: ESLint | undefined;

function sharedProductEslint(): ESLint {
  productEslint ??= new ESLint({ cwd: REPO_ROOT, overrideConfig: [SYNTACTIC_PRODUCT_OVERRIDE] });
  return productEslint;
}

/**
 * Lints an inert fixture's exact text with the product's ESLint configuration as though it lived at
 * `productPath`, and reports every error-severity diagnostic the configuration produces for it.
 */
export async function observeSpecTreeLintErrors(
  fixturePath: string,
  productPath: string,
): Promise<readonly SpecTreeLintErrorObservation[]> {
  const [result] = await sharedProductEslint().lintText(await readFile(fixturePath, "utf-8"), {
    filePath: resolve(REPO_ROOT, productPath),
  });
  if (result === undefined) throw new Error(productPath);
  return result.messages
    .filter((message) => message.fatal === true || message.severity === ESLINT_ERROR_SEVERITY)
    .map(({ ruleId, line, message }) => ({ ruleId, line, message }));
}
