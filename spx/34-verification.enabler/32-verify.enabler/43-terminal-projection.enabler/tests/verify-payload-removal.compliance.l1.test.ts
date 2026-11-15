import { describe, expect, it } from "vitest";

import {
  VERIFY_CLI_ERROR,
  VERIFY_CLI_EXIT_CODE,
  verifyFinishCommand,
  type VerifyFinishReport,
  verifyInputCommand,
  verifyRenderCommand,
  type VerifyStatusReport,
} from "@/commands/verify/cli";
import { JOURNAL_RUN_STATE_STATUS } from "@/domains/journal/run-state";
import { sampleVerifyTestValue, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import {
  isDirectory,
  payloadDirectoryOf,
  samplePayloadFileName,
  stageEscapingPayload,
  stageRunPayload,
  withPayloadDirectoryRepository,
} from "@testing/harnesses/verify/payload-directory";

describe("verify finish payload-directory removal", () => {
  it("removes the payload directory when finish seals the run from a linked worktree, and a repeated finish, render, and input still succeed", async () => {
    await withPayloadDirectoryRepository(async (payloads) => {
      const run = await payloads.startRun();
      const added = await payloads.addScopeUnit(run);
      const linked = await payloads.repository.linkWorktree();
      const finishOptions = { ...run.selectors, terminalStatus: JOURNAL_RUN_STATE_STATUS.REJECTED };

      const finished = await verifyFinishCommand(finishOptions, payloads.deps({ cwd: linked.worktreeDir }));
      const repeated = await verifyFinishCommand(finishOptions, payloads.deps());
      const rendered = await verifyRenderCommand(run.selectors, payloads.deps());
      const replayed = await verifyInputCommand(run.selectors, payloads.deps());

      expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
      expect(added.exitCode, added.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
      expect(finished.exitCode, finished.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
      expect(finished.payloadRemovalFailure).toBeUndefined();
      expect((JSON.parse(finished.output) as VerifyFinishReport).sealed).toBe(true);
      expect(await isDirectory(payloadDirectoryOf(run))).toBe(false);
      expect(repeated.exitCode, repeated.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
      expect(JSON.parse(repeated.output)).toEqual(JSON.parse(finished.output));
      expect(rendered.exitCode, rendered.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
      expect(replayed.exitCode, replayed.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
    });
  });

  it("removes nothing when finish records no terminal completion", async () => {
    await withPayloadDirectoryRepository(async (payloads) => {
      const run = await payloads.startRun();
      const added = await payloads.addScopeUnit(run);

      const finished = await verifyFinishCommand(
        {
          ...run.selectors,
          terminalStatus: JOURNAL_RUN_STATE_STATUS.REJECTED,
          runPayload: samplePayloadFileName(),
        },
        payloads.deps(),
      );
      const status = await payloads.status(run);

      expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
      expect(added.exitCode, added.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
      expect(finished.exitCode, finished.output).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
      expect(status.exitCode, status.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
      expect((JSON.parse(status.output) as VerifyStatusReport).sealed).toBe(false);
      expect(await isDirectory(payloadDirectoryOf(run))).toBe(true);
    });
  });

  it("leaves the run sealed with its terminal projection and names the directory when removal fails, and a later start removes it", async () => {
    await withPayloadDirectoryRepository(async (payloads) => {
      const run = await payloads.startRun();
      const added = await payloads.addScopeUnit(run);
      const finishOptions = { ...run.selectors, terminalStatus: JOURNAL_RUN_STATE_STATUS.REJECTED };

      const finished = await verifyFinishCommand(finishOptions, payloads.refusingRemovalDeps());
      const status = await payloads.status(run);
      const repeated = await verifyFinishCommand(finishOptions, payloads.deps());
      const leftBehind = await isDirectory(payloadDirectoryOf(run));
      const next = await payloads.startRun();

      expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
      expect(added.exitCode, added.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
      expect(finished.exitCode, finished.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
      expect(finished.payloadRemovalFailure?.reason).not.toHaveLength(0);
      expect(finished.payloadRemovalFailure?.directory).toBe(payloadDirectoryOf(run));
      expect(status.exitCode, status.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
      expect((JSON.parse(status.output) as VerifyStatusReport).sealed).toBe(true);
      expect(JSON.parse(finished.output)).toEqual(JSON.parse(repeated.output));
      expect(leftBehind).toBe(true);
      expect(next.started.exitCode, next.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
      expect(await isDirectory(payloadDirectoryOf(run))).toBe(false);
    });
  });

  it("reads the terminal metadata a run-relative name selects, and rejects a name resolving outside the payload directory before recording terminal completion", async () => {
    await withPayloadDirectoryRepository(async (payloads) => {
      const metadata = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewChangesRequestedTerminalMetadata());
      const rejected = await payloads.startRun();
      const rejectedAdded = await payloads.addScopeUnit(rejected);
      const { outsidePath, linkName } = await stageEscapingPayload(
        payloads.repository.productDir,
        rejected,
        JSON.stringify(metadata),
      );
      const accepted = await payloads.startRun();
      const acceptedAdded = await payloads.addScopeUnit(accepted);
      const metadataName = await stageRunPayload(accepted, JSON.stringify(metadata));

      const escapes = [];
      for (const name of [`../${samplePayloadFileName()}`, outsidePath, linkName]) {
        escapes.push({
          name,
          finished: await verifyFinishCommand(
            { ...rejected.selectors, terminalStatus: JOURNAL_RUN_STATE_STATUS.REJECTED, runPayload: name },
            payloads.deps(),
          ),
        });
      }
      const rejectedStatus = await payloads.status(rejected);
      const finished = await verifyFinishCommand(
        { ...accepted.selectors, terminalStatus: JOURNAL_RUN_STATE_STATUS.REJECTED, runPayload: metadataName },
        payloads.deps(),
      );

      for (const run of [rejected, accepted]) {
        expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
      }
      expect(rejectedAdded.exitCode, rejectedAdded.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
      expect(acceptedAdded.exitCode, acceptedAdded.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
      for (const escape of escapes) {
        expect(escape.finished.exitCode, escape.name).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(escape.finished.output, escape.name).toContain(VERIFY_CLI_ERROR.RUN_PAYLOAD_REJECTED);
      }
      expect(rejectedStatus.exitCode, rejectedStatus.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
      expect((JSON.parse(rejectedStatus.output) as VerifyStatusReport).sealed).toBe(false);
      expect(finished.exitCode, finished.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
      expect((JSON.parse(finished.output) as VerifyFinishReport).terminalMetadata).toEqual(metadata);
    });
  });
});
