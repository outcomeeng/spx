import { describe, expect, it } from "vitest";

import { VERIFY_CLI_ERROR, VERIFY_CLI_EXIT_CODE } from "@/commands/verify/cli";
import { EVIDENCE_REQUIREMENT, evidenceFieldPath } from "@/domains/verify/evidence-rejection";
import { VERIFY_SCOPE_PAYLOAD_FIELD, VERIFY_SCOPE_TYPE, VERIFY_VERIFICATION_TYPE } from "@/domains/verify/verify";
import { sampleVerifyTestValue, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import { withVerifyHeadCommitRepository } from "@testing/harnesses/verify/repository";

// The repository's checkout is detached at an empty base commit while a branch names the head commit
// that adds `filePath`. A changeset run ending at that branch judges the head commit, which holds
// `filePath`; a file-scope run judges the checkout's HEAD, the base commit, which holds no file.
describe("verify scope judged paths", () => {
  it.each(Object.values(VERIFY_VERIFICATION_TYPE))(
    "records each judged file a %s run's head commit holds by its product-relative path",
    async (verificationType) => {
      await withVerifyHeadCommitRepository(async (repository) => {
        const run = await repository.startRun(VERIFY_SCOPE_TYPE.CHANGESET, verificationType);
        expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
        const judged = sampleVerifyTestValue(
          VERIFY_TEST_GENERATOR.judgedPathsCase(verificationType, run.scope, repository.filePath),
        );

        const scope = await repository.appendScope(run, judged.heldPayload);

        expect(scope.appended.exitCode, scope.appended.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(scope.scopePayloads).toMatchObject([
          { [VERIFY_SCOPE_PAYLOAD_FIELD.JUDGED_PATHS]: [repository.filePath] },
        ]);
      });
    },
  );

  it.each(Object.values(VERIFY_VERIFICATION_TYPE))(
    "rejects a judged file the %s run's head commit does not hold, though the checkout carries it, and appends nothing",
    async (verificationType) => {
      await withVerifyHeadCommitRepository(async (repository) => {
        const run = await repository.startRun(VERIFY_SCOPE_TYPE.CHANGESET, verificationType);
        expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
        const judged = sampleVerifyTestValue(
          VERIFY_TEST_GENERATOR.judgedPathsCase(verificationType, run.scope, repository.filePath),
        );
        await repository.writeCheckoutFile(judged.absentPath);

        const scope = await repository.appendScope(run, judged.absentPayload);

        expect(scope.appended.exitCode, scope.appended.output).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(scope.appended.output).toContain(VERIFY_CLI_ERROR.SCOPE_INVALID);
        expect(scope.appended.output).toContain(EVIDENCE_REQUIREMENT.JUDGED_PATH_HELD_AT_HEAD);
        expect(scope.appended.output).toContain(
          evidenceFieldPath(VERIFY_SCOPE_PAYLOAD_FIELD.JUDGED_PATHS, String(judged.absentIndex)),
        );
        expect(scope.appended.output).not.toContain(
          evidenceFieldPath(VERIFY_SCOPE_PAYLOAD_FIELD.JUDGED_PATHS, String(judged.heldIndex)),
        );
        expect(scope.scopePayloads).toEqual([]);
      });
    },
  );

  it.each(Object.values(VERIFY_VERIFICATION_TYPE))(
    "rejects, for a %s file-scope run, the file only a changeset run's head commit holds, and appends nothing",
    async (verificationType) => {
      await withVerifyHeadCommitRepository(async (repository) => {
        const run = await repository.startRun(VERIFY_SCOPE_TYPE.FILE, verificationType);
        expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
        const judged = sampleVerifyTestValue(
          VERIFY_TEST_GENERATOR.judgedPathsCase(verificationType, run.scope, repository.filePath),
        );

        const scope = await repository.appendScope(run, judged.heldPayload);

        expect(scope.appended.exitCode, scope.appended.output).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(scope.appended.output).toContain(VERIFY_CLI_ERROR.SCOPE_INVALID);
        expect(scope.appended.output).toContain(EVIDENCE_REQUIREMENT.JUDGED_PATH_HELD_AT_HEAD);
        expect(scope.appended.output).toContain(
          evidenceFieldPath(VERIFY_SCOPE_PAYLOAD_FIELD.JUDGED_PATHS, String(judged.heldOnlyIndex)),
        );
        expect(scope.scopePayloads).toEqual([]);
      });
    },
  );
});
