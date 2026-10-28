import { dirname, join } from "node:path";

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

// A run-relative payload name selects a file of the run's payload directory. Each rejection case stages a
// payload the append would accept at a location outside that directory and names it, once through a
// symbolic link staged inside the directory and once through a parent-directory segment. A read that
// follows the name would record the payload, so the journal stays empty only when the name is rejected.
// The rejection is the containment diagnostic, and the injected filesystem records no read of the file
// outside the directory, so the check precedes every read. The conforming cases stage the same payloads
// inside the directory, directly and through a symbolic link that resolves inside it, and the journal
// holds exactly what was staged.
describe("verify append run-relative payload", () => {
  it.each(Object.values(VERIFY_VERIFICATION_TYPE))(
    "reads the scope file of the staged name in a %s run's payload directory",
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
        expect(scope.payloads).toMatchObject([{ [VERIFY_SCOPE_PAYLOAD_FIELD.JUDGED_PATHS]: [repository.filePath] }]);
      });
    },
  );

  it.each(Object.values(VERIFY_VERIFICATION_TYPE))(
    "reads the scope file a symbolic link in a %s run's payload directory resolves to inside it",
    async (verificationType) => {
      await withVerifyHeadCommitRepository(async (repository) => {
        const run = await repository.startRun(VERIFY_SCOPE_TYPE.CHANGESET, verificationType);
        expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
        const judged = sampleVerifyTestValue(
          VERIFY_TEST_GENERATOR.judgedPathsCase(verificationType, run.scope, repository.filePath),
        );
        const names = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.payloadNamePair());
        const payloadDirectory = repository.payloadDirectory(verificationType, run.runToken ?? "");
        await repository.stagePayloadContent(payloadDirectory, names.first, JSON.stringify(judged.heldPayload));
        await repository.linkPayload(payloadDirectory, names.second, join(payloadDirectory, names.first));

        const scope = await repository.appendFromRunPayload(run, VERIFY_APPEND_EVENT_TYPE.SCOPE, names.second);

        expect(scope.appended.exitCode, scope.appended.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(scope.payloads).toMatchObject([{ [VERIFY_SCOPE_PAYLOAD_FIELD.JUDGED_PATHS]: [repository.filePath] }]);
      });
    },
  );

  it("reads the finding file of the staged name in a review run's payload directory", async () => {
    await withVerifyHeadCommitRepository(async (repository) => {
      const run = await repository.startRun(VERIFY_SCOPE_TYPE.CHANGESET, VERIFY_VERIFICATION_TYPE.REVIEW);
      expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
      const finding = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewFinding());
      const name = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.runToken());
      await repository.stagePayloadContent(
        repository.payloadDirectory(VERIFY_VERIFICATION_TYPE.REVIEW, run.runToken ?? ""),
        name,
        JSON.stringify(finding),
      );

      const appended = await repository.appendFromRunPayload(run, VERIFY_APPEND_EVENT_TYPE.FINDING, name);

      expect(appended.appended.exitCode, appended.appended.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
      expect(appended.payloads).toEqual([finding]);
    });
  });

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
        const outsideFile = join(repository.productDir, outsideName);
        await repository.stagePayloadContent(repository.productDir, outsideName, JSON.stringify(judged.heldPayload));
        await repository.linkPayload(
          repository.payloadDirectory(verificationType, run.runToken ?? ""),
          linkName,
          outsideFile,
        );

        const scope = await repository.appendFromRunPayload(run, VERIFY_APPEND_EVENT_TYPE.SCOPE, linkName);

        expect(scope.appended.exitCode, scope.appended.output).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(scope.appended.output).toContain(VERIFY_CLI_ERROR.PAYLOAD_OUTSIDE_RUN_DIRECTORY);
        expect(scope.payloads).toEqual([]);
        expect(scope.readPaths).not.toContain(outsideFile);
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
        const outsideDirectory = dirname(repository.payloadDirectory(verificationType, run.runToken ?? ""));
        await repository.stagePayloadContent(outsideDirectory, outsideName, JSON.stringify(judged.heldPayload));

        const scope = await repository.appendFromRunPayload(run, VERIFY_APPEND_EVENT_TYPE.SCOPE, `../${outsideName}`);

        expect(scope.appended.exitCode, scope.appended.output).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(scope.appended.output).toContain(VERIFY_CLI_ERROR.PAYLOAD_OUTSIDE_RUN_DIRECTORY);
        expect(scope.payloads).toEqual([]);
        expect(scope.readPaths).not.toContain(join(outsideDirectory, outsideName));
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
      const outsideFile = join(repository.productDir, outsideName);
      await repository.stagePayloadContent(repository.productDir, outsideName, JSON.stringify(finding));
      await repository.linkPayload(
        repository.payloadDirectory(VERIFY_VERIFICATION_TYPE.REVIEW, run.runToken ?? ""),
        linkName,
        outsideFile,
      );

      const appended = await repository.appendFromRunPayload(run, VERIFY_APPEND_EVENT_TYPE.FINDING, linkName);

      expect(appended.appended.exitCode, appended.appended.output).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
      expect(appended.appended.output).toContain(VERIFY_CLI_ERROR.PAYLOAD_OUTSIDE_RUN_DIRECTORY);
      expect(appended.payloads).toEqual([]);
      expect(appended.readPaths).not.toContain(outsideFile);
    });
  });

  it("rejects a finding name of a parent-directory segment that leaves a review run's payload directory, before any read", async () => {
    await withVerifyHeadCommitRepository(async (repository) => {
      const run = await repository.startRun(VERIFY_SCOPE_TYPE.CHANGESET, VERIFY_VERIFICATION_TYPE.REVIEW);
      expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
      const finding = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewFinding());
      const outsideName = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.runToken());
      const outsideDirectory = dirname(
        repository.payloadDirectory(VERIFY_VERIFICATION_TYPE.REVIEW, run.runToken ?? ""),
      );
      await repository.stagePayloadContent(outsideDirectory, outsideName, JSON.stringify(finding));

      const appended = await repository.appendFromRunPayload(
        run,
        VERIFY_APPEND_EVENT_TYPE.FINDING,
        `../${outsideName}`,
      );

      expect(appended.appended.exitCode, appended.appended.output).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
      expect(appended.appended.output).toContain(VERIFY_CLI_ERROR.PAYLOAD_OUTSIDE_RUN_DIRECTORY);
      expect(appended.payloads).toEqual([]);
      expect(appended.readPaths).not.toContain(join(outsideDirectory, outsideName));
    });
  });
});
