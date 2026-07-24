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
  observeValidationBuiltinRuleRuns,
  observeValidationRuleRun,
  observeValidationRuleRuns,
} from "@testing/harnesses/validation/eslint";

describe("TypeScript AST enforcement mappings", () => {
  it("maps every generated conforming and violating case to its diagnostics and fixes", () => {
    const observations = [
      ...observeValidationBuiltinRuleRuns(astRestrictedSyntaxRuns()),
      observeValidationRuleRun({ ...astBareStringUnionRun(), rule: noBareStringUnions }),
      observeValidationRuleRun({ ...astImportSourceExtensionRun(), rule: noImportSourceExtensions }),
      observeValidationRuleRun({ ...astDeepRelativeImportRun(), rule: noDeepRelativeImports }),
      ...observeValidationRuleRuns(astNoSpecReferencesRuns(), noSpecReferences),
      ...observeValidationRuleRuns(astBddTryCatchRuns(), noBddTryCatchAntiPattern),
    ];
    observations.forEach((observation) => {
      observation.valid.forEach((testCase) => expect(testCase.messages).toHaveLength(0));
      observation.invalid.forEach((testCase) => {
        expect(testCase.messages).toHaveLength(testCase.expectedErrors.length);
        testCase.expectedErrors.forEach((expected, index) => {
          const actual = testCase.messages[index];
          if (expected.messageId === undefined) {
            expect(actual?.message).toBe(expected.message);
          } else {
            expect(actual?.messageId).toBe(expected.messageId);
          }
        });
        if (testCase.expectedOutput !== undefined) {
          expect(testCase.actualOutput).toBe(testCase.expectedOutput ?? testCase.source);
        }
      });
    });
  });
});
