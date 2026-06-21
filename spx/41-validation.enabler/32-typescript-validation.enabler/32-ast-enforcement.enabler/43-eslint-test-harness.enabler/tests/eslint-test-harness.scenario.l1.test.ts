import noBareStringUnions from "@eslint-rules/no-bare-string-unions";
import noDeepRelativeImports from "@eslint-rules/no-deep-relative-imports";
import { describe, expect, it } from "vitest";

import {
  astBareStringUnionRun,
  astDeepRelativeImportRun,
  astRestrictedSyntaxRuns,
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
  it("drives a parser-backed rule run through a fresh tester and an explicit tester", () => {
    const run = { ...astBareStringUnionRun(), rule: noBareStringUnions };

    expect(() => runValidationRuleTester(run)).not.toThrow();
    expect(() => runValidationRuleTesterWith(createValidationRuleTester(), run)).not.toThrow();
  });

  it("drives a parser-free rule run through the parser-free tester", () => {
    const run = { ...astDeepRelativeImportRun(), rule: noDeepRelativeImports };

    expect(() => runValidationRuleTesterWithoutParser(run)).not.toThrow();
  });

  it("drives a resolved builtin rule run through the builtin tester", () => {
    for (const run of astRestrictedSyntaxRuns()) {
      expect(() => runValidationBuiltinRuleTester(run)).not.toThrow();
    }
  });
});

describe("eslint rule-tester harness — builtin resolution", () => {
  it("resolves a registered builtin rule and rejects an unregistered name", () => {
    const [firstRun] = astRestrictedSyntaxRuns();

    expect(validationBuiltinRule(firstRun.ruleName)).toBeDefined();
    expect(() => validationBuiltinRule(`${firstRun.ruleName}.unregistered`)).toThrow();
  });
});
