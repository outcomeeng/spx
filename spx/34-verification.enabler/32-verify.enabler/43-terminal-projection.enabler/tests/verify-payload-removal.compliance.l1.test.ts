import { realpath, stat, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  VERIFY_CLI_ERROR,
  VERIFY_CLI_EXIT_CODE,
  verifyAppendScopeCommand,
  verifyFinishCommand,
  type VerifyFinishReport,
  verifyInputCommand,
  verifyRenderCommand,
  verifyStartCommand,
  type VerifyStartReport,
  verifyStatusCommand,
  type VerifyStatusReport,
} from "@/commands/verify/cli";
import { JOURNAL_RUN_STATE_STATUS } from "@/domains/journal/run-state";
import { VERIFY_SCOPE_TYPE, VERIFY_VERIFICATION_TYPE } from "@/domains/verify/verify";
import { sampleVerifyTestValue, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import {
  type PayloadDirectoryRepository,
  samplePayloadFileName,
  sampleRemovalRefusal,
  withPayloadDirectoryRepository,
} from "@testing/harnesses/verify/payload-directory";

const verificationType = VERIFY_VERIFICATION_TYPE.REVIEW;
const metadataName = samplePayloadFileName();
const removalRefusal = sampleRemovalRefusal();

interface RunOptions {
  readonly verificationType: string;
  readonly scopeType: string;
  readonly scope: string;
  readonly run: string;
}

interface StartedRun {
  readonly report: VerifyStartReport;
  readonly options: RunOptions;
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

/** Start a review run of the repository's file and record one scope unit, so it can seal. */
async function startScopedRun({ repository, deps }: PayloadDirectoryRepository): Promise<StartedRun> {
  const started = await verifyStartCommand(
    { verificationType, scopeType: VERIFY_SCOPE_TYPE.FILE, scope: repository.filePath, input: repository.filePath },
    deps(),
  );
  expect(started.exitCode, started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
  const report = JSON.parse(started.output) as VerifyStartReport;
  const options = {
    verificationType,
    scopeType: VERIFY_SCOPE_TYPE.FILE,
    scope: repository.filePath,
    run: report.runToken,
  };
  const unit = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.unjudgedScopeUnit(verificationType, repository.filePath));
  const added = await verifyAppendScopeCommand(
    {
      ...options,
      payload: JSON.stringify(unit),
      idempotencyKey: sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey()),
    },
    deps({ readPayloadSource: async (source) => source }),
  );
  expect(added.exitCode, added.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
  return { report, options };
}

async function runStatus({ deps }: PayloadDirectoryRepository, run: StartedRun): Promise<VerifyStatusReport> {
  const status = await verifyStatusCommand(run.options, deps());
  expect(status.exitCode, status.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
  return JSON.parse(status.output) as VerifyStatusReport;
}

describe("verify finish payload-directory removal", () => {
  it("removes the payload directory when finish seals the run from a linked worktree, and a repeated finish, render, and input still succeed", async () => {
    await withPayloadDirectoryRepository(async (payloads) => {
      const run = await startScopedRun(payloads);
      const linked = await payloads.repository.linkWorktree();
      const finishOptions = { ...run.options, terminalStatus: JOURNAL_RUN_STATE_STATUS.REJECTED };

      const finished = await verifyFinishCommand(finishOptions, payloads.deps({ cwd: linked.worktreeDir }));

      expect(finished.exitCode, finished.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
      expect(finished.payloadRemovalFailure).toBeUndefined();
      expect((JSON.parse(finished.output) as VerifyFinishReport).sealed).toBe(true);
      expect(await isDirectory(run.report.payloadDirectory)).toBe(false);
      const repeated = await verifyFinishCommand(finishOptions, payloads.deps());
      expect(repeated.exitCode, repeated.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
      expect(JSON.parse(repeated.output)).toEqual(JSON.parse(finished.output));
      expect((await verifyRenderCommand(run.options, payloads.deps())).exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
      expect((await verifyInputCommand(run.options, payloads.deps())).exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
    });
  });

  it("removes nothing when finish records no terminal completion", async () => {
    await withPayloadDirectoryRepository(async (payloads) => {
      const run = await startScopedRun(payloads);

      const finished = await verifyFinishCommand(
        { ...run.options, terminalStatus: JOURNAL_RUN_STATE_STATUS.REJECTED, runPayload: metadataName },
        payloads.deps(),
      );

      expect(finished.exitCode, finished.output).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
      expect((await runStatus(payloads, run)).sealed).toBe(false);
      expect(await isDirectory(run.report.payloadDirectory)).toBe(true);
    });
  });

  it("leaves the run sealed with its terminal projection and names the directory when removal fails, and a later start removes it", async () => {
    await withPayloadDirectoryRepository(async (payloads) => {
      const run = await startScopedRun(payloads);
      const finishOptions = { ...run.options, terminalStatus: JOURNAL_RUN_STATE_STATUS.REJECTED };

      const finished = await verifyFinishCommand(
        finishOptions,
        payloads.deps({
          removePayloadDirectory: async () => {
            throw new Error(removalRefusal);
          },
        }),
      );

      expect(finished.exitCode, finished.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
      expect(finished.payloadRemovalFailure?.reason).toContain(removalRefusal);
      expect(await realpath(finished.payloadRemovalFailure?.directory ?? "")).toBe(run.report.payloadDirectory);
      expect((await runStatus(payloads, run)).sealed).toBe(true);
      const repeated = await verifyFinishCommand(finishOptions, payloads.deps());
      expect(JSON.parse(finished.output)).toEqual(JSON.parse(repeated.output));
      expect(await isDirectory(run.report.payloadDirectory)).toBe(true);

      await startScopedRun(payloads);

      expect(await isDirectory(run.report.payloadDirectory)).toBe(false);
    });
  });

  it("reads the terminal metadata a run-relative name selects, and rejects a name resolving outside the payload directory before recording terminal completion", async () => {
    await withPayloadDirectoryRepository(async (payloads) => {
      const metadata = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewChangesRequestedTerminalMetadata());
      const outside = join(payloads.repository.productDir, metadataName);
      await writeFile(outside, JSON.stringify(metadata));
      const rejected = await startScopedRun(payloads);
      const linkName = samplePayloadFileName();
      await symlink(outside, join(rejected.report.payloadDirectory, linkName));

      for (const name of [`../${metadataName}`, outside, linkName]) {
        const finished = await verifyFinishCommand(
          { ...rejected.options, terminalStatus: JOURNAL_RUN_STATE_STATUS.REJECTED, runPayload: name },
          payloads.deps(),
        );
        expect(finished.exitCode, name).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(finished.output, name).toContain(VERIFY_CLI_ERROR.RUN_PAYLOAD_REJECTED);
      }
      expect((await runStatus(payloads, rejected)).sealed).toBe(false);

      const accepted = await startScopedRun(payloads);
      await writeFile(join(accepted.report.payloadDirectory, metadataName), JSON.stringify(metadata));
      const finished = await verifyFinishCommand(
        { ...accepted.options, terminalStatus: JOURNAL_RUN_STATE_STATUS.REJECTED, runPayload: metadataName },
        payloads.deps(),
      );

      expect(finished.exitCode, finished.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
      expect((JSON.parse(finished.output) as VerifyFinishReport).terminalMetadata).toEqual(metadata);
    });
  });
});
