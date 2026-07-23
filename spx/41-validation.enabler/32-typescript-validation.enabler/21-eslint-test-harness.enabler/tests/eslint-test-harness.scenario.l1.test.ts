import { builtinRules } from "eslint/use-at-your-own-risk";
import { describe, expect, it } from "vitest";

import noBareStringUnions from "@eslint-rules/no-bare-string-unions";
import noDeepRelativeImports from "@eslint-rules/no-deep-relative-imports";
import {
  astBareStringUnionRun,
  astDeepRelativeImportRun,
  astRestrictedSyntaxRuns,
  validationBuiltinRuleResolutionScenario,
} from "@testing/generators/validation/ast-enforcement";
import {
  createValidationRuleTester,
  installValidationRuleTesterHooks,
  runValidationBuiltinRuleTester,
  runValidationRuleTester,
  runValidationRuleTesterWith,
  runValidationRuleTesterWithoutParser,
  validationBuiltinRule,
} from "@testing/harnesses/validation/eslint";

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
    const scenario = validationBuiltinRuleResolutionScenario();
    expect(validationBuiltinRule(scenario.registeredRuleName)).toBe(
      builtinRules.get(scenario.registeredRuleName),
    );
    expect(() => validationBuiltinRule(scenario.unregisteredRuleName)).toThrow();
  });
});
