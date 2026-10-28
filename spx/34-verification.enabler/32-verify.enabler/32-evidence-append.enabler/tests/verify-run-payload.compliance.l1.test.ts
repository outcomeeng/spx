import { dirname } from "node:path";

import { describe, expect, it } from "vitest";

import { VERIFY_CLI_ERROR, VERIFY_CLI_EXIT_CODE } from "@/commands/verify/cli";
import {
  VERIFY_APPEND_EVENT_TYPE,
  VERIFY_SCOPE_PAYLOAD_FIELD,
  VERIFY_SCOPE_TYPE,
  VERIFY_VERIFICATION_TYPE,
} from "@/domains/verify/verify";
import { sampleVerifyTestValue, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import { withVerifyHeadCommitRepository } from "@testing/harnesses/verify/repository";

// A run-relative payload name selects a file of the run's payload directory. The conforming case stages a
// valid scope payload under a name in that directory. The violating cases name a file that lies outside the
// directory, once through a symbolic link staged inside the directory and once through a parent-directory
// segment, and the file outside holds a payload that would be accepted, so a read that follows the name
// records evidence where the rule demands rejection. The command output carries no payload-validation
// reason when the name is rejected before any read, and the journal holds no event of the appended kind.
describe("verify append run-relative payload", () => {
  it.each(Object.values(VERIFY_VERIFICATION_TYPE))(
    "reads the file of the staged name in a %s run's payload directory",
    async (verificationType) => {
      await withVerifyHeadCommitRepository(async (repository) => {
        const run = await repository.startRun(VERIFY_SCOPE_TYPE.CHANGESET, verificationType);
        expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
        const judged = sampleVerifyTestValue(
          VERIFY_TEST_GENERATOR.judgedPathsCase(verificationType, run.scope, repository.filePath),
        );
        const name = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.runToken());
        await repository.stagePayloadContent(
          repository.payloadDirectory(verificationType, run.runToken ?? ""),
          name,
          JSON.stringify(judged.heldPayload),
        );

        const scope = await repository.appendFromRunPayload(run, VERIFY_APPEND_EVENT_TYPE.SCOPE, name);

        expect(scope.appended.exitCode, scope.appended.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(scope.payloads).toMatchObject([
          { [VERIFY_SCOPE_PAYLOAD_FIELD.JUDGED_PATHS]: [repository.filePath] },
        ]);
      });
    },
  );

  it.each(Object.values(VERIFY_VERIFICATION_TYPE))(
    "rejects a scope name of a symbolic link in a %s run's payload directory that resolves outside it, before any read",
    async (verificationType) => {
      await withVerifyHeadCommitRepository(async (repository) => {
        const run = await repository.startRun(VERIFY_SCOPE_TYPE.CHANGESET, verificationType);
        expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
        const judged = sampleVerifyTestValue(
          VERIFY_TEST_GENERATOR.judgedPathsCase(verificationType, run.scope, repository.filePath),
        );
        const outsideName = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.runToken());
        const linkName = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.runToken());
        await repository.stagePayloadContent(
          repository.productDir,
          outsideName,
          JSON.stringify(judged.heldPayload),
        );
        await repository.linkPayload(
          repository.payloadDirectory(verificationType, run.runToken ?? ""),
          linkName,
          `${repository.productDir}/${outsideName}`,
        );

        const scope = await repository.appendFromRunPayload(run, VERIFY_APPEND_EVENT_TYPE.SCOPE, linkName);

        expect(scope.appended.exitCode, scope.appended.output).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(scope.appended.output).not.toContain(VERIFY_CLI_ERROR.SCOPE_INVALID);
        expect(scope.appended.output).not.toContain(VERIFY_CLI_ERROR.PAYLOAD_INVALID);
        expect(scope.payloads).toEqual([]);
      });
    },
  );

  it.each(Object.values(VERIFY_VERIFICATION_TYPE))(
    "rejects a scope name of a parent-directory segment that leaves a %s run's payload directory, before any read",
    async (verificationType) => {
      await withVerifyHeadCommitRepository(async (repository) => {
        const run = await repository.startRun(VERIFY_SCOPE_TYPE.CHANGESET, verificationType);
        expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
        const judged = sampleVerifyTestValue(
          VERIFY_TEST_GENERATOR.judgedPathsCase(verificationType, run.scope, repository.filePath),
        );
        const outsideName = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.runToken());
        const payloadDirectory = repository.payloadDirectory(verificationType, run.runToken ?? "");
        await repository.stagePayloadContent(
          dirname(payloadDirectory),
          outsideName,
          JSON.stringify(judged.heldPayload),
        );

        const scope = await repository.appendFromRunPayload(run, VERIFY_APPEND_EVENT_TYPE.SCOPE, `../${outsideName}`);

        expect(scope.appended.exitCode, scope.appended.output).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(scope.appended.output).not.toContain(VERIFY_CLI_ERROR.SCOPE_INVALID);
        expect(scope.appended.output).not.toContain(VERIFY_CLI_ERROR.PAYLOAD_INVALID);
        expect(scope.payloads).toEqual([]);
      });
    },
  );

  it("rejects a finding name of a symbolic link in a review run's payload directory that resolves outside it, before any read", async () => {
    await withVerifyHeadCommitRepository(async (repository) => {
      const run = await repository.startRun(VERIFY_SCOPE_TYPE.CHANGESET, VERIFY_VERIFICATION_TYPE.REVIEW);
      expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
      const finding = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewFinding());
      const outsideName = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.runToken());
      const linkName = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.runToken());
      await repository.stagePayloadContent(repository.productDir, outsideName, JSON.stringify(finding));
      await repository.linkPayload(
        repository.payloadDirectory(VERIFY_VERIFICATION_TYPE.REVIEW, run.runToken ?? ""),
        linkName,
        `${repository.productDir}/${outsideName}`,
      );

      const appended = await repository.appendFromRunPayload(run, VERIFY_APPEND_EVENT_TYPE.FINDING, linkName);

      expect(appended.appended.exitCode, appended.appended.output).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
      expect(appended.appended.output).not.toContain(VERIFY_CLI_ERROR.FINDING_INVALID);
      expect(appended.appended.output).not.toContain(VERIFY_CLI_ERROR.PAYLOAD_INVALID);
      expect(appended.payloads).toEqual([]);
    });
  });
});
