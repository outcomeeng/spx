import { describe, expect, it } from "vitest";

import { VERIFY_START_REPORT_FIELD } from "@/commands/verify/cli";
import { VERIFY_CLI } from "@/interfaces/cli/verify";
import {
  inspectVerificationStartScopeGrammar,
  observeVerificationScopeOptionMappings,
} from "@testing/harnesses/verify/harness";

describe("record-run scope option mapping", () => {
  it("passes every supported selector through the caller-driven command path", async () => {
    await observeVerificationScopeOptionMappings().then((observations) => {
      observations.forEach(
        (
          {
            expectedResolvedScope,
            expectedSubject,
            recordedOptions,
            reportFields,
            resolvedScope,
            scope,
            scopeType,
            subject,
          },
        ) => {
          expect(recordedOptions).toMatchObject([{
            scopeType,
            scope,
          }]);
          expect(subject).toStrictEqual(expectedSubject);
          expect(resolvedScope).toStrictEqual(expectedResolvedScope);
          expect(reportFields).toStrictEqual(Object.values(VERIFY_START_REPORT_FIELD));
        },
      );
    });
  });

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
