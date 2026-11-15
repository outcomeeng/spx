import { dirname } from "node:path";

import { describe, expect, it } from "vitest";

import {
  VERIFY_CLI_ERROR,
  VERIFY_CLI_EXIT_CODE,
  type VerifyAppendReport,
  type VerifyFinishReport,
} from "@/commands/verify/cli";
import { JOURNAL_RUN_STATE_STATUS } from "@/domains/journal/run-state";
import { VERIFY_INPUT_SOURCE } from "@/domains/verify/verify";
import { VERIFY_CLI } from "@/interfaces/cli/verify";
import { CLI_TIMEOUTS_MS } from "@testing/harnesses/constants";
import { flagOf, withBuiltPayloadRun } from "@testing/harnesses/verify/built-cli";
import { isDirectory, samplePayloadFileName, withReadOnlyDirectory } from "@testing/harnesses/verify/payload-directory";

describe("record-run payload sources through the built executable", () => {
  it(
    "requires exactly one of --payload and --run-payload, beside --idempotency-key, on scope add and finding add",
    async () => {
      await withBuiltPayloadRun(async (run) => {
        const payloadName = await run.stageRunPayload();
        const observations = [];
        for (const commandPath of [VERIFY_CLI.scopeCommandName, VERIFY_CLI.findingCommandName]) {
          const add = [commandPath, VERIFY_CLI.addCommandName];
          observations.push({
            commandPath,
            neither: await run.run(add, [...run.runSelectors, ...run.idempotencyOption()]),
            both: await run.run(
              add,
              [
                ...run.runSelectors,
                flagOf(VERIFY_CLI.payloadOption),
                VERIFY_INPUT_SOURCE.STDIN,
                flagOf(VERIFY_CLI.runPayloadOption),
                payloadName,
                ...run.idempotencyOption(),
              ],
              run.scopeUnit,
            ),
            withoutKey: await run.run(add, [...run.runSelectors, flagOf(VERIFY_CLI.runPayloadOption), payloadName]),
          });
        }

        expect(run.start.exitCode, run.start.stderr).toBe(VERIFY_CLI_EXIT_CODE.OK);
        for (const observation of observations) {
          for (const rejected of [observation.neither, observation.both]) {
            expect(rejected.exitCode, observation.commandPath).not.toBe(VERIFY_CLI_EXIT_CODE.OK);
            expect(rejected.stderr, observation.commandPath).toContain(VERIFY_CLI_ERROR.PAYLOAD_REQUIRED);
          }
          expect(observation.withoutKey.exitCode, observation.commandPath).not.toBe(VERIFY_CLI_EXIT_CODE.OK);
          expect(observation.withoutKey.stderr, observation.commandPath).toContain(
            flagOf(VERIFY_CLI.idempotencyKeyOption),
          );
        }
      });
    },
    CLI_TIMEOUTS_MS.E2E_BATCH,
  );

  it(
    "reads --run-payload from the run's payload directory, --payload from stdin or a file path from the invocation directory, and rejects --run-payload with --terminal-metadata on finish",
    async () => {
      await withBuiltPayloadRun(async (run) => {
        const payloadName = await run.stageRunPayload();
        const invocationName = samplePayloadFileName();
        const invocationDirectory = await run.stageInvocationDirectoryPayload(invocationName);
        const scopeAdd = [VERIFY_CLI.scopeCommandName, VERIFY_CLI.addCommandName];

        const fromRunPayload = await run.run(scopeAdd, [
          ...run.runSelectors,
          flagOf(VERIFY_CLI.runPayloadOption),
          payloadName,
          ...run.idempotencyOption(),
        ]);
        const fromStdin = await run.run(
          scopeAdd,
          [
            ...run.runSelectors,
            flagOf(VERIFY_CLI.payloadOption),
            VERIFY_INPUT_SOURCE.STDIN,
            ...run.idempotencyOption(),
          ],
          run.scopeUnit,
        );
        const fromInvocationDirectory = await run.run(
          scopeAdd,
          [...run.runSelectors, flagOf(VERIFY_CLI.payloadOption), invocationName, ...run.idempotencyOption()],
          undefined,
          invocationDirectory,
        );
        const finishWithBoth = await run.run([VERIFY_CLI.finishCommandName], [
          ...run.runSelectors,
          flagOf(VERIFY_CLI.terminalStatusOption),
          JOURNAL_RUN_STATE_STATUS.REJECTED,
          flagOf(VERIFY_CLI.terminalMetadataOption),
          payloadName,
          flagOf(VERIFY_CLI.runPayloadOption),
          payloadName,
        ]);

        expect(run.start.exitCode, run.start.stderr).toBe(VERIFY_CLI_EXIT_CODE.OK);
        // Each append records new evidence rather than replaying an earlier key, so each read its own source.
        for (const added of [fromRunPayload, fromStdin, fromInvocationDirectory]) {
          expect(added.exitCode, added.stderr).toBe(VERIFY_CLI_EXIT_CODE.OK);
          expect((JSON.parse(added.stdout) as VerifyAppendReport).idempotent, added.stdout).toBe(false);
        }
        expect(finishWithBoth.exitCode).not.toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(finishWithBoth.stderr).toContain(VERIFY_CLI_ERROR.TERMINAL_METADATA_SOURCE_CONFLICT);
      });
    },
    CLI_TIMEOUTS_MS.E2E_BATCH,
  );

  it(
    "accepts --run-payload alone on finding add and on finish, and finish records the terminal metadata the run-relative file holds",
    async () => {
      await withBuiltPayloadRun(async (run) => {
        const scopeName = await run.stageRunPayload();
        const findingName = await run.stageRunPayload(run.finding);
        const metadataName = await run.stageRunPayload(run.terminalMetadata);

        const scopeAdded = await run.run([VERIFY_CLI.scopeCommandName, VERIFY_CLI.addCommandName], [
          ...run.runSelectors,
          flagOf(VERIFY_CLI.runPayloadOption),
          scopeName,
          ...run.idempotencyOption(),
        ]);
        const findingAdded = await run.run([VERIFY_CLI.findingCommandName, VERIFY_CLI.addCommandName], [
          ...run.runSelectors,
          flagOf(VERIFY_CLI.runPayloadOption),
          findingName,
          ...run.idempotencyOption(),
        ]);
        const finished = await run.run([VERIFY_CLI.finishCommandName], [
          ...run.runSelectors,
          flagOf(VERIFY_CLI.terminalStatusOption),
          JOURNAL_RUN_STATE_STATUS.REJECTED,
          flagOf(VERIFY_CLI.runPayloadOption),
          metadataName,
        ]);

        expect(run.start.exitCode, run.start.stderr).toBe(VERIFY_CLI_EXIT_CODE.OK);
        for (const added of [scopeAdded, findingAdded]) {
          expect(added.exitCode, added.stderr).toBe(VERIFY_CLI_EXIT_CODE.OK);
          expect((JSON.parse(added.stdout) as VerifyAppendReport).idempotent, added.stdout).toBe(false);
        }
        expect(finished.exitCode, finished.stderr).toBe(VERIFY_CLI_EXIT_CODE.OK);
        const report = JSON.parse(finished.stdout) as VerifyFinishReport;
        expect(report.sealed).toBe(true);
        expect(report.terminalMetadata).toEqual(JSON.parse(run.terminalMetadata));
      });
    },
    CLI_TIMEOUTS_MS.E2E_BATCH,
  );

  it(
    "writes a diagnostic naming the payload directory to standard error when its removal fails, and the structured result to standard output with the exit it has without the failure",
    async () => {
      await withBuiltPayloadRun(async (run) => {
        const payloadDirectory = run.payloadDirectory();
        const scopeAdded = await run.run(
          [VERIFY_CLI.scopeCommandName, VERIFY_CLI.addCommandName],
          [
            ...run.runSelectors,
            flagOf(VERIFY_CLI.payloadOption),
            VERIFY_INPUT_SOURCE.STDIN,
            ...run.idempotencyOption(),
          ],
          run.scopeUnit,
        );
        const finished = await withReadOnlyDirectory(
          dirname(payloadDirectory),
          async () =>
            run.run([VERIFY_CLI.finishCommandName], [
              ...run.runSelectors,
              flagOf(VERIFY_CLI.terminalStatusOption),
              JOURNAL_RUN_STATE_STATUS.REJECTED,
            ]),
        );

        expect(run.start.exitCode, run.start.stderr).toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(scopeAdded.exitCode, scopeAdded.stderr).toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(finished.exitCode, finished.stderr).toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect((JSON.parse(finished.stdout) as VerifyFinishReport).sealed).toBe(true);
        expect(finished.stderr).toContain(VERIFY_CLI.payloadRemovalDiagnostic);
        expect(finished.stderr).toContain(payloadDirectory);
        expect(await isDirectory(payloadDirectory)).toBe(true);
      });
    },
    CLI_TIMEOUTS_MS.E2E_BATCH,
  );
});
