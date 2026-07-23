import type { Linter, Rule } from "eslint";
import { ESLint, RuleTester } from "eslint";
import { builtinRules } from "eslint/use-at-your-own-risk";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import tseslint from "typescript-eslint";

import { readTypeScriptExcludeGlobs } from "@/validation/eslint-config-exclusions";
import { LINT_POLICY_MANIFESTS, parseLintPolicyManifest } from "@/validation/lint-policy-constants";
import { MIRROR_RULES } from "@eslint-rules/offline-mirror";
import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import {
  validationEslintRuleTesterLanguageOptions,
  type ValidationGeneratedTypeScriptExclusionsScenario,
  type ValidationLintDebtManifestEntries,
  validationRuleTesterHooks,
} from "@testing/generators/validation/ast-enforcement";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

// The validation harness lints virtual text through `lintText`, which cannot
// satisfy the type-aware project service the production mirror enables. Disable
// the mirror for the harness instance so the syntactic custom rules under test
// still run; type-aware enforcement is covered by the code-quality node tests.
const SYNTACTIC_MIRROR_OVERRIDE: Linter.Config = {
  languageOptions: { parserOptions: { projectService: false } },
  rules: Object.fromEntries(
    Object.keys(MIRROR_RULES).map((rule): [string, Linter.RuleEntry] => [
      rule,
      "off",
    ]),
  ),
};

const REPO_ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");

export function readLintDebtManifestEntries(): ValidationLintDebtManifestEntries {
  const readManifest = (
    manifest: (typeof LINT_POLICY_MANIFESTS)[keyof typeof LINT_POLICY_MANIFESTS],
  ): readonly string[] =>
    parseLintPolicyManifest(
      readFileSync(join(REPO_ROOT, manifest.file), "utf-8"),
      manifest.file,
      manifest.key,
    );

  return {
    testLintDebtNodes: readManifest(LINT_POLICY_MANIFESTS.TEST_LINT_DEBT_NODES),
    testOwnedConstantDebtNodes: readManifest(LINT_POLICY_MANIFESTS.TEST_OWNED_CONSTANT_DEBT_NODES),
  };
}

export interface ValidationRuleTesterCases {
  readonly valid: RuleTester.ValidTestCase[] | string[];
  readonly invalid: RuleTester.InvalidTestCase[];
}

export interface ValidationRuleTesterRun {
  readonly ruleName: string;
  readonly rule: Rule.RuleModule;
  readonly cases: ValidationRuleTesterCases;
}

export interface ValidationLintTextCase {
  readonly code: string;
  readonly filePath: string;
  readonly ruleId: string;
}

export function installValidationRuleTesterHooks(): void {
  const hooks = validationRuleTesterHooks();
  RuleTester.describe = (_text, method) => method();
  RuleTester.it = (_text, method) => method();
  (RuleTester as unknown as Record<string, unknown>)[hooks.afterAllKey] = hooks.afterAll;
}

export function createValidationRuleTester(): RuleTester {
  return new RuleTester({
    languageOptions: {
      ...validationEslintRuleTesterLanguageOptions(),
      parser: tseslint.parser,
    },
  });
}

export function createValidationRuleTesterWithoutParser(): RuleTester {
  return new RuleTester({
    languageOptions: validationEslintRuleTesterLanguageOptions(),
  });
}

export function runValidationRuleTester(run: ValidationRuleTesterRun): void {
  createValidationRuleTester().run(run.ruleName, run.rule, run.cases);
}

export function runValidationRuleTesterWithoutParser(run: ValidationRuleTesterRun): void {
  createValidationRuleTesterWithoutParser().run(run.ruleName, run.rule, run.cases);
}

export function runValidationBuiltinRuleTester(run: Omit<ValidationRuleTesterRun, "rule">): void {
  runValidationRuleTester({
    ...run,
    rule: validationBuiltinRule(run.ruleName),
  });
}

export function runValidationBuiltinRuleTesterRuns(
  runs: readonly Omit<ValidationRuleTesterRun, "rule">[],
): void {
  for (const run of runs) runValidationBuiltinRuleTester(run);
}

export function runValidationRuleTesterRuns(
  runs: readonly Omit<ValidationRuleTesterRun, "rule">[],
  rule: Rule.RuleModule,
): void {
  for (const run of runs) runValidationRuleTester({ ...run, rule });
}

export function runValidationRuleTesterWith(
  ruleTester: RuleTester,
  run: ValidationRuleTesterRun,
): void {
  ruleTester.run(run.ruleName, run.rule, run.cases);
}

export function validationBuiltinRule(name: string): Rule.RuleModule {
  const rule = builtinRules.get(name);
  if (rule === undefined) {
    throw new Error(name);
  }
  return rule;
}

export function createValidationEslint(): ESLint {
  return new ESLint({
    cwd: process.cwd(),
    overrideConfig: [SYNTACTIC_MIRROR_OVERRIDE],
  });
}

export async function readValidationConfigRules(
  eslint: ESLint,
  filePath: string,
): Promise<Linter.RulesRecord> {
  return (await eslint.calculateConfigForFile(filePath)).rules;
}

export function observeMissingTypeScriptConfigError(
  scenario: ValidationGeneratedTypeScriptExclusionsScenario,
): string | undefined {
  try {
    readTypeScriptExcludeGlobs(scenario.missingConfigFile);
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

export async function observeRelativeTypeScriptExcludeGlobs(
  scenario: ValidationGeneratedTypeScriptExclusionsScenario,
): Promise<readonly string[]> {
  return withTestEnv(MINIMAL_SPEC_TREE_CONFIG, async ({ productDir, writeRaw }) => {
    await writeRaw(scenario.baseConfigFile, JSON.stringify(scenario.baseConfig));
    await writeRaw(scenario.childConfigFile, JSON.stringify(scenario.childConfig));
    return readTypeScriptExcludeGlobs(join(productDir, scenario.childConfigFile));
  });
}

export async function observePackageTypeScriptExcludeGlobs(
  scenario: ValidationGeneratedTypeScriptExclusionsScenario,
): Promise<readonly string[]> {
  return withTestEnv(MINIMAL_SPEC_TREE_CONFIG, async ({ productDir, writeRaw }) => {
    await writeRaw(scenario.packageConfigFile, JSON.stringify(scenario.packageConfig));
    await writeRaw(scenario.packageManifestFile, JSON.stringify(scenario.packageManifest));
    await writeRaw(scenario.childConfigFile, JSON.stringify(scenario.packageChildConfig));
    return readTypeScriptExcludeGlobs(join(productDir, scenario.childConfigFile));
  });
}

export function severityOf(ruleConfig: unknown): number | undefined {
  if (typeof ruleConfig === "number") return ruleConfig;
  if (Array.isArray(ruleConfig) && typeof ruleConfig[0] === "number") return ruleConfig[0];
  return undefined;
}

export async function lintValidationText(
  eslint: ESLint,
  testCase: Omit<ValidationLintTextCase, "ruleId">,
): Promise<ESLint.LintResult> {
  const result = (await eslint.lintText(testCase.code, { filePath: testCase.filePath })).at(0);
  if (result === undefined) {
    throw new Error(testCase.filePath);
  }
  return result;
}

export function messagesForRule(
  result: ESLint.LintResult,
  ruleId: string,
): Array<ESLint.LintResult["messages"][number]> {
  return result.messages.filter((message) => message.ruleId === ruleId);
}
