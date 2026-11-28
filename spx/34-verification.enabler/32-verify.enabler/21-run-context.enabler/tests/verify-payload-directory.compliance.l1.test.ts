import { realpath, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { VERIFY_CLI_EXIT_CODE } from "@/commands/verify/cli";
import { VERIFY_DRIVE_MODE, VERIFY_PAYLOAD_PATH, VERIFY_VERIFICATION_TYPE } from "@/domains/verify/verify";
import { VERIFY_EVIDENCE_FREE_SEALING_TYPES } from "@testing/generators/verify/verify";
import {
  isDirectory,
  payloadDirectoriesIn,
  payloadDirectoryOf,
  sampleBranchName,
  stageUnjournaledPayloadDirectory,
  withPayloadDirectoryRepository,
} from "@testing/harnesses/verify/payload-directory";

describe("verify start payload directory", () => {
  it.each([VERIFY_DRIVE_MODE.CALLER, VERIFY_DRIVE_MODE.SPX])(
    "creates the run's payload directory inside its type's payload root once its journal exists, for a %s-driven run",
    async (driveMode) => {
      await withPayloadDirectoryRepository(async (payloads) => {
        const run = await payloads.startRun({ deps: { driveMode } });

        expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
        const report = run.report;
        expect(report).toBeDefined();
        if (report === undefined) return;
        const expected = join(
          dirname(report.locator.storageNamespace),
          VERIFY_PAYLOAD_PATH.ROOT,
          `${VERIFY_PAYLOAD_PATH.RUN_DIRECTORY_PREFIX}${report.runToken}`,
        );
        expect(report.payloadDirectory).toBe(await realpath(expected));
        expect(await isDirectory(report.payloadDirectory)).toBe(true);
        expect((await stat(report.locator.runTarget)).isFile()).toBe(true);
      });
    },
  );

  it("creates no payload directory when the run's journal cannot be opened", async () => {
    await withPayloadDirectoryRepository(async (payloads) => {
      const run = await payloads.startRun({ deps: payloads.journalRefusingDeps() });

      expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
      expect(run.report).toBeUndefined();
      expect(await payloadDirectoriesIn(payloads.repository.productDir)).toEqual([]);
    });
  });

  it("removes the payload directory of every run whose journal carries a terminal-completion event or a seal, under every verification type and branch scope, and keeps every other one", async () => {
    await withPayloadDirectoryRepository(async (payloads) => {
      // Every run starts before any closes, because each start sweeps the runs already closed.
      // A run of a type `finish` seals with no evidence also closes by a terminal-completion event alone.
      const open = [];
      const closing = [];
      for (const branch of [undefined, sampleBranchName()]) {
        for (const verificationType of Object.values(VERIFY_VERIFICATION_TYPE)) {
          open.push(await payloads.startRun({ verificationType, branch }));
          closing.push({ run: await payloads.startRun({ verificationType, branch }), close: payloads.sealOnly });
          if (VERIFY_EVIDENCE_FREE_SEALING_TYPES.some((sealing) => sealing === verificationType)) {
            closing.push({
              run: await payloads.startRun({ verificationType, branch }),
              close: payloads.recordTerminalEventOnly,
            });
          }
        }
      }
      const kept: string[] = [];
      for (const run of open) {
        expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
        kept.push(payloadDirectoryOf(run), await stageUnjournaledPayloadDirectory(run));
      }
      const removed: string[] = [];
      for (const { run, close } of closing) {
        expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
        const closed = await close(run);
        expect(closed.exitCode, closed.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
        removed.push(payloadDirectoryOf(run));
      }
      for (const directory of [...kept, ...removed]) {
        expect(await isDirectory(directory), directory).toBe(true);
      }

      const next = await payloads.startRun();

      expect(next.started.exitCode, next.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
      for (const directory of removed) {
        expect(await isDirectory(directory), directory).toBe(false);
      }
      for (const directory of [...kept, payloadDirectoryOf(next)]) {
        expect(await isDirectory(directory), directory).toBe(true);
      }
    });
  });
});
