import type { Linter, Rule } from "eslint";
import { ESLint, RuleTester } from "eslint";
import { builtinRules } from "eslint/use-at-your-own-risk";
import * as fc from "fast-check";
import { join } from "node:path";
import tseslint from "typescript-eslint";
import { beforeAll, describe, expect, it } from "vitest";

import { readTypeScriptExcludeGlobs } from "@/validation/eslint-config-exclusions";
import noBareStringUnions from "@eslint-rules/no-bare-string-unions";
import noDeepRelativeImports from "@eslint-rules/no-deep-relative-imports";
import { MIRROR_RULES } from "@eslint-rules/offline-mirror";
import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import {
  astBareStringUnionRun,
  astDeepRelativeImportRun,
  astRestrictedSyntaxRuns,
  validationConfigSeverityScenarios,
  validationEslintRuleTesterLanguageOptions,
  validationLintScenarios,
  validationRuleRegistrationCases,
  validationRuleTesterHooks,
  validationTypeScriptExclusionsScenario,
} from "@testing/generators/validation/ast-enforcement";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";
import { runTestOwnedConstantDebtAdditionScenario } from "@testing/harnesses/validation/lint-policy";

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

export function registerValidationEslintIntegrationTests(): void {
  describe("ESLint rules integration", () => {
    let eslint: ESLint;

    beforeAll(() => {
      eslint = createValidationEslint();
    });

    describe("plugin registration", () => {
      for (const testCase of validationRuleRegistrationCases()) {
        it(testCase.title, async () => {
          const config = await eslint.calculateConfigForFile(testCase.filePath);
          for (const ruleId of testCase.ruleIds) expect(config.rules).toHaveProperty(ruleId);
        });
      }
    });

    describe("configured severity", () => {
      for (const testCase of validationConfigSeverityScenarios()) {
        it(testCase.title, async () => {
          const config = await eslint.calculateConfigForFile(testCase.filePath);
          for (const expectation of testCase.expectations) {
            expect(severityOf(config.rules[expectation.ruleId])).toBe(expectation.severity);
          }
        });
      }
    });

    describe("production lint behavior", () => {
      for (const testCase of validationLintScenarios()) {
        it(testCase.title, async () => {
          const result = await lintValidationText(eslint, testCase);
          for (const expectation of testCase.expectations) {
            const messages = messagesForRule(result, expectation.ruleId);
            expect(messages).toHaveLength(expectation.count);
            if (expectation.severity !== undefined) {
              for (const message of messages) expect(message.severity).toBe(expectation.severity);
            }
          }
        });
      }
    });

    describe("TypeScript config exclusions", () => {
      it("fails loudly when the configured TypeScript config cannot be read", () => {
        const testCase = validationTypeScriptExclusionsScenario();
        expect(() => readTypeScriptExcludeGlobs(testCase.missingConfigFile)).toThrow(testCase.missingConfigFile);
      });

      it("reads exclusions through relative TypeScript config extends", async () => {
        const testCase = validationTypeScriptExclusionsScenario();
        await withTestEnv(MINIMAL_SPEC_TREE_CONFIG, async ({ productDir, writeRaw }) => {
          await writeRaw(testCase.baseConfigFile, JSON.stringify(testCase.baseConfig));
          await writeRaw(testCase.childConfigFile, JSON.stringify(testCase.childConfig));
          expect(readTypeScriptExcludeGlobs(join(productDir, testCase.childConfigFile))).toEqual(
            expect.arrayContaining([...testCase.expectedGlobs]),
          );
        });
      });

      it("reads exclusions through package TypeScript config extends", async () => {
        const testCase = validationTypeScriptExclusionsScenario();
        await withTestEnv(MINIMAL_SPEC_TREE_CONFIG, async ({ productDir, writeRaw }) => {
          await writeRaw(testCase.packageConfigFile, JSON.stringify(testCase.packageConfig));
          await writeRaw(testCase.packageManifestFile, JSON.stringify(testCase.packageManifest));
          await writeRaw(testCase.childConfigFile, JSON.stringify(testCase.packageChildConfig));
          expect(readTypeScriptExcludeGlobs(join(productDir, testCase.childConfigFile))).toEqual(
            expect.arrayContaining([...testCase.expectedPackageGlobs]),
          );
        });
      });
    });

    it("rejects test-owned constant debt added beyond the committed baseline", async () => {
      await runTestOwnedConstantDebtAdditionScenario();
    });
  });
}

export function registerValidationRuleTesterHarnessScenarioTests(): void {
  installValidationRuleTesterHooks();
  describe("eslint rule-tester harness — runners", () => {
    it("drives parser-backed rules through fresh and explicit testers", () => {
      const run = { ...astBareStringUnionRun(), rule: noBareStringUnions };
      expect(() => runValidationRuleTester(run)).not.toThrow();
      expect(() => runValidationRuleTesterWith(createValidationRuleTester(), run)).not.toThrow();
    });
    it("drives a parser-free rule through the parser-free tester", () => {
      expect(() =>
        runValidationRuleTesterWithoutParser({
          ...astDeepRelativeImportRun(),
          rule: noDeepRelativeImports,
        })
      ).not.toThrow();
    });
    it("drives resolved builtin rule runs through the builtin tester", () => {
      const runs = astRestrictedSyntaxRuns();
      expect(runs.length).toBeGreaterThan(0);
      for (const run of runs) expect(() => runValidationBuiltinRuleTester(run)).not.toThrow();
    });
  });
  describe("eslint rule-tester harness — builtin resolution", () => {
    it("resolves registered builtins and rejects unregistered names", () => {
      const firstRun = astRestrictedSyntaxRuns().at(0);
      if (firstRun === undefined) throw new Error("restricted syntax runs are empty");
      expect(validationBuiltinRule(firstRun.ruleName)).toBe(builtinRules.get(firstRun.ruleName));
      expect(() => validationBuiltinRule(`${firstRun.ruleName}.unregistered`)).toThrow();
    });
  });
}

export function registerValidationRuleTesterHarnessPropertyTests(): void {
  describe("eslint rule-tester harness — severityOf", () => {
    it("reads every numeric rule config as its severity", () => {
      assertProperty(
        fc.integer(),
        (severity) => {
          expect(severityOf(severity)).toBe(severity);
        },
        { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
      );
    });
    it("reads every numeric array head as its severity", () => {
      assertProperty(
        fc.tuple(fc.integer(), fc.array(fc.anything())),
        ([severity, options]) => {
          expect(severityOf([severity, ...options])).toBe(severity);
        },
        { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
      );
    });
    it("maps every nonnumeric config to no severity", () => {
      assertProperty(
        fc.anything().filter((value) =>
          typeof value !== "number"
          && !(Array.isArray(value) && typeof value[0] === "number")
        ),
        (config) => {
          expect(severityOf(config)).toBeUndefined();
        },
        { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
      );
    });
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
