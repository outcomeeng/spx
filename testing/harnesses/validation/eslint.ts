import type { Rule } from "eslint";
import { ESLint, Linter, RuleTester } from "eslint";
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

export interface ValidationRuleCaseObservation {
  readonly actualOutput: string;
  readonly expectedErrors: readonly { readonly message?: string; readonly messageId?: string }[];
  readonly expectedOutput: string | null | undefined;
  readonly messages: readonly Linter.LintMessage[];
  readonly source: string;
}

export interface ValidationRuleRunObservation {
  readonly invalid: readonly ValidationRuleCaseObservation[];
  readonly valid: readonly ValidationRuleCaseObservation[];
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

export function observeValidationRuleRun(run: ValidationRuleTesterRun): ValidationRuleRunObservation {
  return {
    valid: run.cases.valid.map((testCase) => observeValidationRuleCase(run, testCase, [])),
    invalid: run.cases.invalid.map((testCase) => {
      if (!Array.isArray(testCase.errors)) {
        throw new Error(`Expected generated errors to be explicit for ${run.ruleName}`);
      }
      return observeValidationRuleCase(
        run,
        testCase,
        testCase.errors as readonly { readonly message?: string; readonly messageId?: string }[],
      );
    }),
  };
}

export function observeValidationBuiltinRuleRuns(
  runs: readonly Omit<ValidationRuleTesterRun, "rule">[],
): readonly ValidationRuleRunObservation[] {
  return runs.map((run) => observeValidationRuleRun({ ...run, rule: validationBuiltinRule(run.ruleName) }));
}

export function observeValidationRuleRuns(
  runs: readonly Omit<ValidationRuleTesterRun, "rule">[],
  rule: Rule.RuleModule,
): readonly ValidationRuleRunObservation[] {
  return runs.map((run) => observeValidationRuleRun({ ...run, rule }));
}

function observeValidationRuleCase(
  run: ValidationRuleTesterRun,
  testCase: RuleTester.ValidTestCase | RuleTester.InvalidTestCase | string,
  expectedErrors: readonly { readonly message?: string; readonly messageId?: string }[],
): ValidationRuleCaseObservation {
  const source = typeof testCase === "string" ? testCase : testCase.code;
  const filename = typeof testCase === "string" ? "case.ts" : testCase.filename ?? "case.ts";
  const options = typeof testCase === "string" || testCase.options === undefined ? [] : testCase.options;
  const caseLanguageOptions = typeof testCase === "string" ? undefined : testCase.languageOptions;
  const ruleId = `observed/${run.ruleName}`;
  const config: Linter.Config = {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      ...validationEslintRuleTesterLanguageOptions(),
      ...caseLanguageOptions,
      parser: caseLanguageOptions?.parser ?? tseslint.parser,
    },
    plugins: {
      observed: {
        rules: { [run.ruleName]: run.rule },
      },
    },
    rules: {
      [ruleId]: ["error", ...options],
    },
  };
  const linter = new Linter({ configType: "flat" });
  const messages = linter.verify(source, config, { filename });
  const fixed = linter.verifyAndFix(source, config, { filename });
  return {
    actualOutput: fixed.output,
    expectedErrors,
    expectedOutput: typeof testCase === "string" || !("output" in testCase) ? undefined : testCase.output,
    messages,
    source,
  };
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
