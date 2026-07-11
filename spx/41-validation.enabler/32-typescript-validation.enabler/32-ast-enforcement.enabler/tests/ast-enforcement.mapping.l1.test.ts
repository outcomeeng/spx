import noBareStringUnions from "@eslint-rules/no-bare-string-unions";
import noBddTryCatchAntiPattern from "@eslint-rules/no-bdd-try-catch-anti-pattern";
import noDeepRelativeImports from "@eslint-rules/no-deep-relative-imports";
import noImportSourceExtensions from "@eslint-rules/no-import-source-extensions";
import noSpecReferences from "@eslint-rules/no-spec-references";
import { describe, expect, it } from "vitest";

import {
  astBareStringUnionRun,
  astBddTryCatchRuns,
  astDeepRelativeImportRun,
  astImportSourceExtensionRun,
  astNoSpecReferencesRuns,
  astRestrictedSyntaxRuns,
} from "@testing/generators/validation/ast-enforcement";
import {
  installValidationRuleTesterHooks,
  runValidationBuiltinRuleTesterRuns,
  runValidationRuleTester,
  runValidationRuleTesterRuns,
} from "@testing/harnesses/validation/eslint";

installValidationRuleTesterHooks();

describe("restricted syntax selectors", () => {
  it("accepts and rejects the registered restricted syntax cases", () => {
    expect(() => runValidationBuiltinRuleTesterRuns(astRestrictedSyntaxRuns())).not.toThrow();
  });
});

describe("import hygiene rule modules", () => {
  it(astBareStringUnionRun().title, () => {
    expect(() =>
      runValidationRuleTester({
        ...astBareStringUnionRun(),
        rule: noBareStringUnions,
      })
    ).not.toThrow();
  });

  it(astImportSourceExtensionRun().title, () => {
    expect(() =>
      runValidationRuleTester({
        ...astImportSourceExtensionRun(),
        rule: noImportSourceExtensions,
      })
    ).not.toThrow();
  });

  it(astDeepRelativeImportRun().title, () => {
    expect(() =>
      runValidationRuleTester({
        ...astDeepRelativeImportRun(),
        rule: noDeepRelativeImports,
      })
    ).not.toThrow();
  });
});

describe("spec reference rule module", () => {
  it("accepts and rejects the registered spec reference cases", () => {
    expect(() => runValidationRuleTesterRuns(astNoSpecReferencesRuns(), noSpecReferences)).not.toThrow();
  });
});

describe("try catch assertion rule module", () => {
  it("accepts and rejects the registered try-catch assertion cases", () => {
    expect(() => runValidationRuleTesterRuns(astBddTryCatchRuns(), noBddTryCatchAntiPattern)).not.toThrow();
  });
});
