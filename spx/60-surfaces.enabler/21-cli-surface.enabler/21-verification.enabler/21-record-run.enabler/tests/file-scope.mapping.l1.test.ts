import { describe, expect, it } from "vitest";

import { VERIFY_START_REPORT_FIELD } from "@/commands/verify/cli";
import { VERIFY_SCOPE_TYPE } from "@/domains/verify/verify";
import { VERIFY_CLI } from "@/interfaces/cli/verify";
import {
  inspectVerificationStartScopeGrammar,
  observeChangesetScopeOptionMapping,
  observeFileScopeOptionMapping,
} from "@testing/harnesses/verify/harness";

describe("record-run scope option mapping", () => {
  it("passes file selectors through the caller-driven command path", async () => {
    await observeFileScopeOptionMapping().then(({ path, recordedOptions, started }) => {
      expect(recordedOptions).toMatchObject([{
        scopeType: VERIFY_SCOPE_TYPE.FILE,
        scope: path,
      }]);
      expect(started.report.resolvedScope).toStrictEqual([path]);
      expect(Object.keys(started.report)).toStrictEqual(Object.values(VERIFY_START_REPORT_FIELD));
    });
  });

  it("passes changeset selectors through the same scope options", async () => {
    await observeChangesetScopeOptionMapping().then(({ scenario, recordedOptions, started }) => {
      expect(recordedOptions).toMatchObject([{
        scopeType: VERIFY_SCOPE_TYPE.CHANGESET,
        scope: scenario.scope,
      }]);
      expect(started.report.resolvedScope).toStrictEqual(
        [...scenario.changedPaths].sort((left, right) => left.localeCompare(right)),
      );
      expect(Object.keys(started.report)).toStrictEqual(Object.values(VERIFY_START_REPORT_FIELD));
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
