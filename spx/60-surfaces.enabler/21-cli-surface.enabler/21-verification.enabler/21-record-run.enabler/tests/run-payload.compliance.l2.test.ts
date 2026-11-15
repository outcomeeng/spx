import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  VERIFY_CLI_ERROR,
  VERIFY_CLI_EXIT_CODE,
  type VerifyFinishReport,
  type VerifyStartReport,
} from "@/commands/verify/cli";
import { JOURNAL_RUN_STATE_STATUS } from "@/domains/journal/run-state";
import { VERIFY_INPUT_SOURCE, VERIFY_SCOPE_TYPE, VERIFY_VERIFICATION_TYPE } from "@/domains/verify/verify";
import { VERIFY_CLI } from "@/interfaces/cli/verify";
import { sampleVerifyTestValue, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import { CLI_TIMEOUTS_MS } from "@testing/harnesses/constants";
import { flagOf, runBuiltVerificationRun } from "@testing/harnesses/verify/built-cli";
import {
  sampleDirectoryName,
  samplePayloadFileName,
  withReadOnlyDirectory,
} from "@testing/harnesses/verify/payload-directory";
import { type VerifyHeadCommitRepository, withVerifyHeadCommitRepository } from "@testing/harnesses/verify/repository";

const verificationType = VERIFY_VERIFICATION_TYPE.REVIEW;
const payloadName = samplePayloadFileName();

interface BuiltStartedRun {
  readonly report: VerifyStartReport;
  readonly runSelectors: readonly string[];
}

function selectorsOf(repository: VerifyHeadCommitRepository): readonly string[] {
  return [
    flagOf(VERIFY_CLI.verificationTypeOption),
    verificationType,
    flagOf(VERIFY_CLI.scopeTypeOption),
    VERIFY_SCOPE_TYPE.FILE,
    flagOf(VERIFY_CLI.scopeOption),
    repository.filePath,
  ];
}

async function startBuiltRun(repository: VerifyHeadCommitRepository): Promise<BuiltStartedRun> {
  const started = await runBuiltVerificationRun(
    repository.productDir,
    [VERIFY_CLI.startCommandName],
    [...selectorsOf(repository), flagOf(VERIFY_CLI.inputOption), VERIFY_INPUT_SOURCE.STDIN],
    repository.filePath,
  );
  expect(started.exitCode, started.stderr).toBe(VERIFY_CLI_EXIT_CODE.OK);
  const report = JSON.parse(started.stdout) as VerifyStartReport;
  return { report, runSelectors: [...selectorsOf(repository), flagOf(VERIFY_CLI.runOption), report.runToken] };
}

function scopeUnit(repository: VerifyHeadCommitRepository): string {
  return JSON.stringify(
    sampleVerifyTestValue(VERIFY_TEST_GENERATOR.unjudgedScopeUnit(verificationType, repository.filePath)),
  );
}

function idempotencyOption(): readonly string[] {
  return [flagOf(VERIFY_CLI.idempotencyKeyOption), sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey())];
}

describe("record-run payload sources through the built executable", () => {
  it(
    "requires exactly one of --payload and --run-payload, beside --idempotency-key, on scope add and finding add",
    async () => {
      await withVerifyHeadCommitRepository(async (repository) => {
        const run = await startBuiltRun(repository);
        await writeFile(join(run.report.payloadDirectory, payloadName), scopeUnit(repository));
        for (const commandPath of [VERIFY_CLI.scopeCommandName, VERIFY_CLI.findingCommandName]) {
          const add = [commandPath, VERIFY_CLI.addCommandName];
          const neither = await runBuiltVerificationRun(repository.productDir, add, [
            ...run.runSelectors,
            ...idempotencyOption(),
          ]);
          const both = await runBuiltVerificationRun(
            repository.productDir,
            add,
            [
              ...run.runSelectors,
              flagOf(VERIFY_CLI.payloadOption),
              VERIFY_INPUT_SOURCE.STDIN,
              flagOf(VERIFY_CLI.runPayloadOption),
              payloadName,
              ...idempotencyOption(),
            ],
            scopeUnit(repository),
          );
          const withoutKey = await runBuiltVerificationRun(repository.productDir, add, [
            ...run.runSelectors,
            flagOf(VERIFY_CLI.runPayloadOption),
            payloadName,
          ]);

          for (const rejected of [neither, both]) {
            expect(rejected.exitCode, commandPath).not.toBe(VERIFY_CLI_EXIT_CODE.OK);
            expect(rejected.stderr, commandPath).toContain(VERIFY_CLI_ERROR.PAYLOAD_REQUIRED);
          }
          expect(withoutKey.exitCode, commandPath).not.toBe(VERIFY_CLI_EXIT_CODE.OK);
          expect(withoutKey.stderr, commandPath).toContain(flagOf(VERIFY_CLI.idempotencyKeyOption));
        }
      });
    },
    CLI_TIMEOUTS_MS.E2E_BATCH,
  );

  it(
    "reads --run-payload from the run's payload directory, --payload from stdin or a file path from the invocation directory, and rejects --run-payload with --terminal-metadata on finish",
    async () => {
      await withVerifyHeadCommitRepository(async (repository) => {
        const run = await startBuiltRun(repository);
        await writeFile(join(run.report.payloadDirectory, payloadName), scopeUnit(repository));
        const invocationDirectory = join(repository.productDir, sampleDirectoryName());
        await mkdir(invocationDirectory);
        await writeFile(join(invocationDirectory, payloadName), scopeUnit(repository));
        const scopeAdd = [VERIFY_CLI.scopeCommandName, VERIFY_CLI.addCommandName];

        const fromRunPayload = await runBuiltVerificationRun(repository.productDir, scopeAdd, [
          ...run.runSelectors,
          flagOf(VERIFY_CLI.runPayloadOption),
          payloadName,
          ...idempotencyOption(),
        ]);
        const fromStdin = await runBuiltVerificationRun(
          repository.productDir,
          scopeAdd,
          [...run.runSelectors, flagOf(VERIFY_CLI.payloadOption), VERIFY_INPUT_SOURCE.STDIN, ...idempotencyOption()],
          scopeUnit(repository),
        );
        const fromInvocationDirectory = await runBuiltVerificationRun(invocationDirectory, scopeAdd, [
          ...run.runSelectors,
          flagOf(VERIFY_CLI.payloadOption),
          payloadName,
          ...idempotencyOption(),
        ]);
        const finishWithBoth = await runBuiltVerificationRun(repository.productDir, [VERIFY_CLI.finishCommandName], [
          ...run.runSelectors,
          flagOf(VERIFY_CLI.terminalStatusOption),
          JOURNAL_RUN_STATE_STATUS.REJECTED,
          flagOf(VERIFY_CLI.terminalMetadataOption),
          payloadName,
          flagOf(VERIFY_CLI.runPayloadOption),
          payloadName,
        ]);

        expect(fromRunPayload.exitCode, fromRunPayload.stderr).toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(fromStdin.exitCode, fromStdin.stderr).toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(fromInvocationDirectory.exitCode, fromInvocationDirectory.stderr).toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(finishWithBoth.exitCode).not.toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(finishWithBoth.stderr).toContain(VERIFY_CLI_ERROR.TERMINAL_METADATA_SOURCE_CONFLICT);
      });
    },
    CLI_TIMEOUTS_MS.E2E_BATCH,
  );

  it(
    "writes a diagnostic naming the payload directory to standard error when its removal fails, and the structured result to standard output with the exit it has without the failure",
    async () => {
      await withVerifyHeadCommitRepository(async (repository) => {
        const run = await startBuiltRun(repository);
        const scopeAdded = await runBuiltVerificationRun(
          repository.productDir,
          [VERIFY_CLI.scopeCommandName, VERIFY_CLI.addCommandName],
          [...run.runSelectors, flagOf(VERIFY_CLI.payloadOption), VERIFY_INPUT_SOURCE.STDIN, ...idempotencyOption()],
          scopeUnit(repository),
        );
        expect(scopeAdded.exitCode, scopeAdded.stderr).toBe(VERIFY_CLI_EXIT_CODE.OK);
        const finished = await withReadOnlyDirectory(
          dirname(run.report.payloadDirectory),
          async () =>
            runBuiltVerificationRun(repository.productDir, [VERIFY_CLI.finishCommandName], [
              ...run.runSelectors,
              flagOf(VERIFY_CLI.terminalStatusOption),
              JOURNAL_RUN_STATE_STATUS.REJECTED,
            ]),
        );

        expect(finished.exitCode, finished.stderr).toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect((JSON.parse(finished.stdout) as VerifyFinishReport).sealed).toBe(true);
        expect(finished.stderr).toContain(VERIFY_CLI.payloadRemovalDiagnostic);
        expect(finished.stderr).toContain(run.report.payloadDirectory);
        expect((await stat(run.report.payloadDirectory)).isDirectory()).toBe(true);
      });
    },
    CLI_TIMEOUTS_MS.E2E_BATCH,
  );
});
