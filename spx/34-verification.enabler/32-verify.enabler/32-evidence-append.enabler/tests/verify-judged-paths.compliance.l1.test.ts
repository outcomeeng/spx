import { describe, expect, it } from "vitest";

import { VERIFY_CLI_ERROR, VERIFY_CLI_EXIT_CODE } from "@/commands/verify/cli";
import { EVIDENCE_REQUIREMENT, evidenceFieldPath } from "@/domains/verify/evidence-rejection";
import {
  VERIFY_RUN_CONTEXT_EVENT_FIELD,
  VERIFY_SCOPE_PAYLOAD_FIELD,
  VERIFY_SCOPE_TYPE,
  VERIFY_VERIFICATION_TYPE,
} from "@/domains/verify/verify";
import { sampleVerifyTestValue, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import {
  withVerifyHeadCommitRepository,
  withVerifyOutsideRepositoryDirectory,
} from "@testing/harnesses/verify/repository";

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

  // Outside any Git repository a file-scope run starts and records no head commit, so no commit can
  // anchor a judged path: scope evidence naming one is refused, while scope evidence naming none
  // records in the same run.
  it.each(Object.values(VERIFY_VERIFICATION_TYPE))(
    "rejects every judged path in a %s run that recorded no head commit, appends nothing, and records scope evidence naming no judged file",
    async (verificationType) => {
      await withVerifyOutsideRepositoryDirectory(async (directory) => {
        expect(directory.gitEntries).toEqual([]);
        const run = await directory.startFileRun(verificationType);
        expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(run.runContextData).toHaveLength(1);
        expect(run.runContextData[0]).not.toHaveProperty(VERIFY_RUN_CONTEXT_EVENT_FIELD.HEAD_COMMIT);
        const judgedPayload = sampleVerifyTestValue(
          VERIFY_TEST_GENERATOR.judgedScopeUnit(verificationType, run.scope, [directory.filePath]),
        );
        const unjudgedPayload = sampleVerifyTestValue(
          VERIFY_TEST_GENERATOR.unjudgedScopeUnit(verificationType, run.scope),
        );

        const judged = await directory.appendScope(run, judgedPayload);

        expect(judged.appended.exitCode, judged.appended.output).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(judged.appended.output).toContain(VERIFY_CLI_ERROR.SCOPE_INVALID);
        expect(judged.appended.output).toContain(EVIDENCE_REQUIREMENT.JUDGED_PATHS_NEED_HEAD_COMMIT);
        expect(judged.scopePayloads).toEqual([]);

        const unjudged = await directory.appendScope(run, unjudgedPayload);

        expect(unjudged.appended.exitCode, unjudged.appended.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(unjudged.scopePayloads).toHaveLength(1);
        expect(unjudged.scopePayloads[0]).not.toHaveProperty(VERIFY_SCOPE_PAYLOAD_FIELD.JUDGED_PATHS);
      });
    },
  );
});
