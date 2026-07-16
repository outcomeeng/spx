import { describe, expect, it } from "vitest";

import { VERIFY_START_REPORT_FIELD } from "@/commands/verify/cli";
import { VERIFY_CLI } from "@/interfaces/cli/verify";
import { verifyScopeMappingCases } from "@testing/generators/verify/verify";
import {
  inspectVerificationStartScopeGrammar,
  observeVerificationScopeOptionMapping,
} from "@testing/harnesses/verify/harness";

describe("record-run scope option mapping", () => {
  it.each(verifyScopeMappingCases())(
    "passes $scopeType selectors through the caller-driven command path",
    async (mapping) => {
      await observeVerificationScopeOptionMapping(mapping).then(
        ({ recordedOptions, reportFields, resolvedScope, subject }) => {
          expect(recordedOptions).toMatchObject([{
            scopeType: mapping.scopeType,
            scope: mapping.scope,
          }]);
          expect(subject).toStrictEqual(mapping.expectedSubject);
          expect(resolvedScope).toStrictEqual(mapping.expectedResolvedScope);
          expect(reportFields).toStrictEqual(Object.values(VERIFY_START_REPORT_FIELD));
        },
      );
    },
  );

  it("describes both public scope grammar forms", () => {
    expect(inspectVerificationStartScopeGrammar()).toStrictEqual({
      startDescription: VERIFY_CLI.startCommandDescription,
      scopeTypeFlags: VERIFY_CLI.scopeTypeOption,
      scopeFlags: VERIFY_CLI.scopeOption,
      scopeTypeDescription: VERIFY_CLI.scopeTypeOptionDescription,
      scopeDescription: VERIFY_CLI.scopeOptionDescription,
    });
  });
});
