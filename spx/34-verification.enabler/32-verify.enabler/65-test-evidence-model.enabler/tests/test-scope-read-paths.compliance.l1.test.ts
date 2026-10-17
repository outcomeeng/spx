import { describe, expect, it } from "vitest";

import { VERIFY_CLI_ERROR, VERIFY_CLI_EXIT_CODE } from "@/commands/verify/cli";
import { evidenceFieldPath } from "@/domains/verify/evidence-rejection";
import {
  evidenceValidatorFor,
  TEST_PAYLOAD_FIELD,
  VERIFY_EVIDENCE_KIND,
  VERIFY_SCOPE_TYPE,
  VERIFY_VERIFICATION_TYPE,
} from "@/domains/verify/verify";
import { STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";
import { sampleVerifyTestValue, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";
import { withVerifyHeadCommitRepository } from "@testing/harnesses/verify/repository";

describe("test scope read paths", () => {
  it("rejects read paths that are not product-relative before any journal event appends, naming the failing field path", async () => {
    await withVerifyHeadCommitRepository(async (repository) => {
      const run = await repository.startRun(VERIFY_SCOPE_TYPE.CHANGESET, VERIFY_VERIFICATION_TYPE.TEST);
      expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
      const rejected = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.testReadPathsRejectedCase());

      const scope = await repository.appendScope(run, rejected.payload);

      expect(scope.appended.exitCode, scope.appended.output).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
      expect(scope.appended.output).toContain(VERIFY_CLI_ERROR.SCOPE_INVALID);
      expect(scope.appended.output).toContain(evidenceFieldPath(...rejected.failingFieldPath));
      expect(scope.scopePayloads).toEqual([]);
    });
  });

  it("names only the failing read-path entry, never a product-relative neighbour", () => {
    assertProperty(
      VERIFY_TEST_GENERATOR.testReadPathsRejectedCase(),
      (rejected) => {
        const result = evidenceValidatorFor(VERIFY_VERIFICATION_TYPE.TEST, VERIFY_EVIDENCE_KIND.SCOPE)?.({
          payload: rejected.payload,
          events: [],
          selector: { scopeType: VERIFY_SCOPE_TYPE.CHANGESET, scopeIdentity: sampleScopeIdentity() },
        });
        expect(result?.ok).toBe(false);
        const reason = result?.ok === false ? result.reason : "";
        expect(reason).toContain(evidenceFieldPath(...rejected.failingFieldPath));
        if (rejected.conformingFieldPath !== undefined) {
          expect(reason).not.toContain(evidenceFieldPath(...rejected.conformingFieldPath));
        }
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("records product-relative read paths in canonical form beside the module identifier", async () => {
    await withVerifyHeadCommitRepository(async (repository) => {
      const run = await repository.startRun(VERIFY_SCOPE_TYPE.CHANGESET, VERIFY_VERIFICATION_TYPE.TEST);
      expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
      const accepted = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.testReadPathsAcceptedCase());

      const scope = await repository.appendScope(run, accepted.payload);

      expect(scope.appended.exitCode, scope.appended.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
      expect(scope.scopePayloads).toMatchObject([{ [TEST_PAYLOAD_FIELD.READ_PATHS]: accepted.recordedPaths }]);
    });
  });
});

function sampleScopeIdentity(): string {
  return sampleVerifyTestValue(STATE_STORE_TEST_GENERATOR.scopeToken());
}
