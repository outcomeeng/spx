import type { Linter, Rule } from "eslint";
import { ESLint, RuleTester } from "eslint";
import { builtinRules } from "eslint/use-at-your-own-risk";
import tseslint from "typescript-eslint";

import { MIRROR_RULES } from "@eslint-rules/sonarjs-mirror";
import {
  validationEslintRuleTesterLanguageOptions,
  validationRuleTesterHooks,
} from "@testing/generators/validation/ast-enforcement";

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
  return rule as Rule.RuleModule;
}

export function createValidationEslint(): ESLint {
  return new ESLint({
    cwd: process.cwd(),
    overrideConfig: [SYNTACTIC_MIRROR_OVERRIDE],
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
  const [result] = await eslint.lintText(testCase.code, { filePath: testCase.filePath });
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
