import type { ESLint, Linter } from "eslint";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createValidationEslint, lintValidationText } from "@testing/harnesses/validation/eslint";

const SPEC_TREE_LINT_FIXTURES_ROOT = resolve(__dirname, "../../fixtures/spec-tree");
const ESLINT_ERROR_SEVERITY: Linter.Severity = 2;

/** Inert whole-file payloads that cross, or stay inside, the spec-tree library import boundary. */
export const SPEC_TREE_IMPORT_BOUNDARY_FIXTURES = {
  PUBLIC_SURFACE_CONSUMER: resolve(SPEC_TREE_LINT_FIXTURES_ROOT, "import-boundary/public-surface-consumer.ts"),
  INTERNAL_MODULE_CONSUMER: resolve(SPEC_TREE_LINT_FIXTURES_ROOT, "import-boundary/internal-module-consumer.ts"),
} as const;

/** Inert whole-file spec-tree test payloads that inject the source explicitly or intercept a module. */
export const SPEC_TREE_MODULE_INTERCEPTION_FIXTURES = {
  INJECTED_SOURCE: resolve(SPEC_TREE_LINT_FIXTURES_ROOT, "module-interception/injected-source.ts"),
  VI_MOCK: resolve(SPEC_TREE_LINT_FIXTURES_ROOT, "module-interception/vi-mock.ts"),
  VI_DO_MOCK: resolve(SPEC_TREE_LINT_FIXTURES_ROOT, "module-interception/vi-do-mock.ts"),
  JEST_MOCK: resolve(SPEC_TREE_LINT_FIXTURES_ROOT, "module-interception/jest-mock.ts"),
  MEMFS: resolve(SPEC_TREE_LINT_FIXTURES_ROOT, "module-interception/memfs.ts"),
} as const;

export interface SpecTreeLintErrorObservation {
  readonly ruleId: string | null;
  readonly line: number;
  readonly message: string;
}

let productEslint: ESLint | undefined;

function sharedProductEslint(): ESLint {
  productEslint ??= createValidationEslint();
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
  const result = await lintValidationText(sharedProductEslint(), {
    code: await readFile(fixturePath, "utf-8"),
    filePath: resolve(process.cwd(), productPath),
  });
  return result.messages
    .filter((message) => message.fatal === true || message.severity === ESLINT_ERROR_SEVERITY)
    .map(({ ruleId, line, message }) => ({ ruleId, line, message }));
}
