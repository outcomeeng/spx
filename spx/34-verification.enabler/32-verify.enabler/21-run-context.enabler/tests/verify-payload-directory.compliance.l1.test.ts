import { realpath, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { VERIFY_CLI_EXIT_CODE } from "@/commands/verify/cli";
import { VERIFY_DRIVE_MODE, VERIFY_PAYLOAD_PATH, VERIFY_VERIFICATION_TYPE } from "@/domains/verify/verify";
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
      const groups = [];
      for (const branch of [undefined, sampleBranchName()]) {
        for (const verificationType of Object.values(VERIFY_VERIFICATION_TYPE)) {
          groups.push({
            open: await payloads.startRun({ verificationType, branch }),
            terminalOnly: await payloads.startRun({ verificationType, branch }),
            sealedOnly: await payloads.startRun({ verificationType, branch }),
          });
        }
      }
      const kept: string[] = [];
      const removed: string[] = [];
      for (const { open, terminalOnly, sealedOnly } of groups) {
        for (const run of [open, terminalOnly, sealedOnly]) {
          expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
        }
        const terminal = await payloads.recordTerminalEventOnly(terminalOnly);
        const sealed = await payloads.sealOnly(sealedOnly);
        expect(terminal.exitCode, terminal.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(sealed.exitCode, sealed.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
        kept.push(payloadDirectoryOf(open), await stageUnjournaledPayloadDirectory(open));
        removed.push(payloadDirectoryOf(terminalOnly), payloadDirectoryOf(sealedOnly));
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
