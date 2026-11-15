import { mkdir, realpath, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  VERIFY_CLI_EXIT_CODE,
  verifyAppendScopeCommand,
  verifyFinishCommand,
  verifyStartCommand,
  type VerifyStartReport,
} from "@/commands/verify/cli";
import { JOURNAL_RUN_STATE_STATUS } from "@/domains/journal/run-state";
import {
  VERIFY_DRIVE_MODE,
  VERIFY_PAYLOAD_PATH,
  VERIFY_SCOPE_TYPE,
  VERIFY_VERIFICATION_TYPE,
} from "@/domains/verify/verify";
import { sampleVerifyTestValue, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import {
  type PayloadDirectoryRepository,
  sampleRemovalRefusal,
  withPayloadDirectoryRepository,
} from "@testing/harnesses/verify/payload-directory";

const verificationType = VERIFY_VERIFICATION_TYPE.REVIEW;

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function startRun(
  { repository, deps }: PayloadDirectoryRepository,
  overrides: Parameters<PayloadDirectoryRepository["deps"]>[0] = {},
): Promise<VerifyStartReport> {
  const started = await verifyStartCommand(
    { verificationType, scopeType: VERIFY_SCOPE_TYPE.FILE, scope: repository.filePath, input: repository.filePath },
    deps(overrides),
  );
  expect(started.exitCode, started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
  return JSON.parse(started.output) as VerifyStartReport;
}

describe("verify start payload directory", () => {
  it.each([VERIFY_DRIVE_MODE.CALLER, VERIFY_DRIVE_MODE.SPX])(
    "creates the run's payload directory inside its type's payload root once its journal exists, for a %s-driven run",
    async (driveMode) => {
      await withPayloadDirectoryRepository(async (payloads) => {
        const started = await startRun(payloads, { driveMode });
        const typeScope = dirname(started.locator.storageNamespace);
        const expected = join(
          typeScope,
          VERIFY_PAYLOAD_PATH.ROOT,
          `${VERIFY_PAYLOAD_PATH.RUN_DIRECTORY_PREFIX}${started.runToken}`,
        );

        expect(started.payloadDirectory).toBe(await realpath(expected));
        expect(await isDirectory(started.payloadDirectory)).toBe(true);
        expect((await stat(started.locator.runTarget)).isFile()).toBe(true);
      });
    },
  );

  it("removes a sealed run's payload directory at start and keeps an open run's and one no journal names", async () => {
    await withPayloadDirectoryRepository(async (payloads) => {
      const { repository, deps } = payloads;
      const open = await startRun(payloads);
      const sealed = await startRun(payloads);
      const sealedRun = {
        verificationType,
        scopeType: VERIFY_SCOPE_TYPE.FILE,
        scope: repository.filePath,
        run: sealed.runToken,
      };
      const unit = sampleVerifyTestValue(
        VERIFY_TEST_GENERATOR.unjudgedScopeUnit(verificationType, repository.filePath),
      );
      const added = await verifyAppendScopeCommand(
        {
          ...sealedRun,
          payload: JSON.stringify(unit),
          idempotencyKey: sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey()),
        },
        deps({ readPayloadSource: async (source) => source }),
      );
      expect(added.exitCode, added.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
      // The seal's own removal fails, so the sealed run's payload directory is left for the next sweep.
      const finished = await verifyFinishCommand(
        { ...sealedRun, terminalStatus: JOURNAL_RUN_STATE_STATUS.REJECTED },
        deps({
          removePayloadDirectory: async () => {
            throw new Error(sampleRemovalRefusal());
          },
        }),
      );
      expect(finished.exitCode, finished.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
      const unjournaled = join(
        dirname(open.payloadDirectory),
        `${VERIFY_PAYLOAD_PATH.RUN_DIRECTORY_PREFIX}unjournaled`,
      );
      await mkdir(unjournaled);
      expect(await isDirectory(sealed.payloadDirectory)).toBe(true);

      const next = await startRun(payloads);

      expect(await isDirectory(sealed.payloadDirectory)).toBe(false);
      expect(await isDirectory(open.payloadDirectory)).toBe(true);
      expect(await isDirectory(unjournaled)).toBe(true);
      expect(await isDirectory(next.payloadDirectory)).toBe(true);
    });
  });
});
