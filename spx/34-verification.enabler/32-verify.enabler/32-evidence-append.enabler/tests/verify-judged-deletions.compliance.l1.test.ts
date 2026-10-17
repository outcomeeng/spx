import { describe, expect, it } from "vitest";

import { VERIFY_CLI_ERROR, VERIFY_CLI_EXIT_CODE } from "@/commands/verify/cli";
import { EVIDENCE_REQUIREMENT, evidenceFieldPath } from "@/domains/verify/evidence-rejection";
import { VERIFY_SCOPE_PAYLOAD_FIELD, VERIFY_SCOPE_TYPE, VERIFY_VERIFICATION_TYPE } from "@/domains/verify/verify";
import {
  sampleVerifyTestValue,
  VERIFY_CHANGE_OPERATION,
  VERIFY_TEST_GENERATOR,
} from "@testing/generators/verify/verify";
import {
  withVerifyChangeInventoryRepository,
  withVerifyHeadCommitRepository,
} from "@testing/harnesses/verify/repository";

// A changeset run's change inventory is recorded at start over `<base>..<head>`. A deleted path is
// one the inventory lists as `deleted`; a path the inventory lists with another change kind, or does
// not list at all, is not a judged deletion the run may record. A file-scope run records no change
// inventory, so it has no deletion to judge.
describe("verify scope judged deletions", () => {
  it.each(Object.values(VERIFY_VERIFICATION_TYPE))(
    "records each judged deletion a %s run's change inventory lists as deleted by its product-relative path",
    async (verificationType) => {
      await withVerifyChangeInventoryRepository(VERIFY_CHANGE_OPERATION.DELETE, async (repository) => {
        const run = await repository.startChangesetRun(verificationType);
        expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
        const judged = sampleVerifyTestValue(
          VERIFY_TEST_GENERATOR.judgedDeletionsCase(verificationType, run.scope, repository.sourcePath),
        );

        const scope = await repository.appendScope(run, judged.listedPayload);

        expect(scope.appended.exitCode, scope.appended.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(scope.scopePayloads).toMatchObject([
          { [VERIFY_SCOPE_PAYLOAD_FIELD.JUDGED_DELETIONS]: [repository.sourcePath] },
        ]);
      });
    },
  );

  it.each(Object.values(VERIFY_VERIFICATION_TYPE))(
    "rejects a judged deletion the %s run's change inventory does not list, and appends nothing",
    async (verificationType) => {
      await withVerifyChangeInventoryRepository(VERIFY_CHANGE_OPERATION.DELETE, async (repository) => {
        const run = await repository.startChangesetRun(verificationType);
        expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
        const judged = sampleVerifyTestValue(
          VERIFY_TEST_GENERATOR.judgedDeletionsCase(verificationType, run.scope, repository.sourcePath),
        );

        const scope = await repository.appendScope(run, judged.unlistedPayload);

        expect(scope.appended.exitCode, scope.appended.output).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(scope.appended.output).toContain(VERIFY_CLI_ERROR.SCOPE_INVALID);
        expect(scope.appended.output).toContain(EVIDENCE_REQUIREMENT.JUDGED_DELETION_LISTED_AS_DELETED);
        expect(scope.appended.output).toContain(
          evidenceFieldPath(VERIFY_SCOPE_PAYLOAD_FIELD.JUDGED_DELETIONS, String(judged.unlistedIndex)),
        );
        expect(scope.appended.output).not.toContain(
          evidenceFieldPath(VERIFY_SCOPE_PAYLOAD_FIELD.JUDGED_DELETIONS, String(judged.deletedIndex)),
        );
        expect(scope.scopePayloads).toEqual([]);
      });
    },
  );

  it.each(Object.values(VERIFY_VERIFICATION_TYPE))(
    "rejects, in a %s run whose change inventory lists the path as modified, a judged deletion naming it, and appends nothing",
    async (verificationType) => {
      await withVerifyChangeInventoryRepository(VERIFY_CHANGE_OPERATION.MODIFY, async (repository) => {
        const run = await repository.startChangesetRun(verificationType);
        expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
        const payload = sampleVerifyTestValue(
          VERIFY_TEST_GENERATOR.judgedDeletionsScopeUnit(verificationType, run.scope, [repository.sourcePath]),
        );

        const scope = await repository.appendScope(run, payload);

        expect(scope.appended.exitCode, scope.appended.output).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(scope.appended.output).toContain(VERIFY_CLI_ERROR.SCOPE_INVALID);
        expect(scope.appended.output).toContain(EVIDENCE_REQUIREMENT.JUDGED_DELETION_LISTED_AS_DELETED);
        expect(scope.appended.output).toContain(
          evidenceFieldPath(VERIFY_SCOPE_PAYLOAD_FIELD.JUDGED_DELETIONS, String(0)),
        );
        expect(scope.scopePayloads).toEqual([]);
      });
    },
  );

  // A file-scope run records no change inventory, so scope evidence naming a judged deletion is
  // refused while scope evidence naming none records in the same run.
  it.each(Object.values(VERIFY_VERIFICATION_TYPE))(
    "rejects every judged deletion in a %s run that recorded no change inventory, appends nothing, and records scope evidence naming none",
    async (verificationType) => {
      await withVerifyHeadCommitRepository(async (repository) => {
        const run = await repository.startRun(VERIFY_SCOPE_TYPE.FILE, verificationType);
        expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
        const judgedPayload = sampleVerifyTestValue(
          VERIFY_TEST_GENERATOR.judgedDeletionsScopeUnit(verificationType, run.scope, [repository.filePath]),
        );
        const unjudgedPayload = sampleVerifyTestValue(
          VERIFY_TEST_GENERATOR.unjudgedScopeUnit(verificationType, run.scope),
        );

        const judged = await repository.appendScope(run, judgedPayload);

        expect(judged.appended.exitCode, judged.appended.output).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(judged.appended.output).toContain(VERIFY_CLI_ERROR.SCOPE_INVALID);
        expect(judged.appended.output).toContain(EVIDENCE_REQUIREMENT.JUDGED_DELETIONS_NEED_CHANGE_INVENTORY);
        expect(judged.scopePayloads).toEqual([]);

        const unjudged = await repository.appendScope(run, unjudgedPayload);

        expect(unjudged.appended.exitCode, unjudged.appended.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(unjudged.scopePayloads).toHaveLength(1);
        expect(unjudged.scopePayloads[0]).not.toHaveProperty(VERIFY_SCOPE_PAYLOAD_FIELD.JUDGED_DELETIONS);
      });
    },
  );
});
