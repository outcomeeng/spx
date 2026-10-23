import { describe, expect, it } from "vitest";

import { runTestsCommand, TEST_RESULT_KIND } from "@/commands/test";
import { SUCCESS_EXIT_CODE } from "@/domains/test";
import { TESTING_CLI } from "@/interfaces/cli/test";
import { AGENT_TEST_OUTPUT_TEXT } from "@/interfaces/cli/test-agent-output";
import { compareAsciiStrings } from "@/lib/state-store";
import { typescriptTestingLanguage } from "@/test/languages/typescript";
import { TEST_PATH_VERDICT } from "@/test/run-state";
import { sampleDispatchValue, TEST_DISPATCH_GENERATOR } from "@testing/generators/testing/dispatch";
import { runTestingCli, testingCliDeps } from "@testing/harnesses/testing/cli";
import {
  arrangeLateArrivingTestFile,
  commitAdditionalTestFile,
  recordedRunCliDependencies,
  recordPassedRun,
  snapshotRunDirectory,
  withRecordedRunRepository,
} from "@testing/harnesses/testing/recorded-run";

describe("reusing a recorded passed run", () => {
  it("invokes no runner and reports the recorded verdicts when a passed run satisfies the request", async () => {
    const { file } = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodeWithOwnFile(typescriptTestingLanguage));

    await withRecordedRunRepository(file, async (repository) => {
      await recordPassedRun(repository);
      const invocationsAfterRecording = repository.runner.calls.length;

      const result = await runTestsCommand({ productDir: repository.productDir, passing: false }, repository.deps);

      expect(repository.runner.calls).toHaveLength(invocationsAfterRecording);
      expect(result.kind).toBe(TEST_RESULT_KIND.REUSED);
      if (result.kind !== TEST_RESULT_KIND.REUSED) return;
      expect(result.outcomes.flatMap((outcome) => outcome.pathVerdicts)).toEqual([
        { testPath: file, verdict: TEST_PATH_VERDICT.PASSED },
      ]);
    });
  });

  it("reports only the selected file's verdict when the recorded passed run covers more files", async () => {
    const { ownFile, descendantFile } = sampleDispatchValue(
      TEST_DISPATCH_GENERATOR.nestedFiles(typescriptTestingLanguage),
    );

    await withRecordedRunRepository(ownFile, async (repository) => {
      await commitAdditionalTestFile(repository, descendantFile);
      await recordPassedRun(repository);
      const invocationsAfterRecording = repository.runner.calls.length;

      const result = await runTestsCommand(
        { productDir: repository.productDir, passing: false, targets: { operands: [ownFile], recursive: false } },
        repository.deps,
      );

      expect(repository.runner.calls).toHaveLength(invocationsAfterRecording);
      expect(result.kind).toBe(TEST_RESULT_KIND.REUSED);
      if (result.kind !== TEST_RESULT_KIND.REUSED) return;
      expect(result.outcomes.flatMap((outcome) => outcome.testPaths)).toEqual([ownFile]);
      expect(result.outcomes.flatMap((outcome) => outcome.pathVerdicts)).toEqual([
        { testPath: ownFile, verdict: TEST_PATH_VERDICT.PASSED },
      ]);
    });
  });

  it("names the recorded run in the command result and in the printed report, and writes no run file", async () => {
    const { file } = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodeWithOwnFile(typescriptTestingLanguage));

    await withRecordedRunRepository(file, async (repository) => {
      const recordedRun = await recordPassedRun(repository);
      const runFilesAfterRecording = await snapshotRunDirectory(repository.productDir);

      const result = await runTestsCommand({ productDir: repository.productDir, passing: false }, repository.deps);
      const printed = await runTestingCli(
        [TESTING_CLI.commandName],
        testingCliDeps(repository.productDir, result, [], []),
      );

      expect(result.runFile.runFilePath).toBe(recordedRun.runFile.runFilePath);
      expect(printed.stdout).toContain(recordedRun.runFile.runFilePath);
      expect(await snapshotRunDirectory(repository.productDir)).toEqual(runFilesAfterRecording);
    });
  });

  it("prints each selected file's path and recorded verdict in the default-mode report of a reused run", async () => {
    const { ownFile, descendantFile } = sampleDispatchValue(
      TEST_DISPATCH_GENERATOR.nestedFiles(typescriptTestingLanguage),
    );

    await withRecordedRunRepository(ownFile, async (repository) => {
      await commitAdditionalTestFile(repository, descendantFile);
      await recordPassedRun(repository);

      const result = await runTestsCommand({ productDir: repository.productDir, passing: false }, repository.deps);
      const printed = await runTestingCli(
        [TESTING_CLI.commandName],
        testingCliDeps(repository.productDir, result, [], []),
      );

      expect(result.kind).toBe(TEST_RESULT_KIND.REUSED);
      if (result.kind !== TEST_RESULT_KIND.REUSED) return;
      const reportedVerdicts = result.outcomes.flatMap((outcome) => outcome.pathVerdicts);
      expect(reportedVerdicts.map((entry) => entry.testPath).sort(compareAsciiStrings)).toEqual(
        [ownFile, descendantFile].sort(compareAsciiStrings),
      );
      const printedLines = printed.stdout.split("\n");
      for (const { testPath, verdict } of reportedVerdicts) {
        expect(printedLines.some((line) => line.includes(testPath) && line.includes(verdict))).toBe(true);
      }
      expect(printed.exitCodes).toEqual([SUCCESS_EXIT_CODE]);
    });
  });

  it("dispatches the selection and records a new run when the caller requires execution", async () => {
    const { file } = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodeWithOwnFile(typescriptTestingLanguage));

    await withRecordedRunRepository(file, async (repository) => {
      await recordPassedRun(repository);
      const invocationsAfterRecording = repository.runner.calls.length;
      const runFilesAfterRecording = await snapshotRunDirectory(repository.productDir);

      const result = await runTestsCommand(
        { productDir: repository.productDir, passing: false, requireExecution: true },
        repository.deps,
      );

      expect(result.kind).toBe(TEST_RESULT_KIND.EXECUTED);
      expect(repository.runner.calls.length).toBeGreaterThan(invocationsAfterRecording);
      expect((await snapshotRunDirectory(repository.productDir)).size).toBe(runFilesAfterRecording.size + 1);
    });
  });

  it("reports the reused result in the compact agent summary and invokes no runner", async () => {
    const { file } = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodeWithOwnFile(typescriptTestingLanguage));

    await withRecordedRunRepository(file, async (repository) => {
      const recordedRun = await recordPassedRun(repository);
      const invocationsAfterRecording = repository.runner.calls.length;
      const runFilesAfterRecording = await snapshotRunDirectory(repository.productDir);

      const printed = await runTestingCli(
        [TESTING_CLI.commandName, TESTING_CLI.agentOption],
        recordedRunCliDependencies(repository),
      );

      expect(repository.runner.calls).toHaveLength(invocationsAfterRecording);
      expect(printed.stdout).toContain(`${AGENT_TEST_OUTPUT_TEXT.REUSED_RUN}: ${recordedRun.runFile.runFilePath}`);
      expect(printed.stdout).toContain(`${AGENT_TEST_OUTPUT_TEXT.TESTS}: 1`);
      expect(printed.exitCodes).toEqual([SUCCESS_EXIT_CODE]);
      expect(await snapshotRunDirectory(repository.productDir)).toEqual(runFilesAfterRecording);
    });
  });
});

describe("one discovery per request", () => {
  it("dispatches only the files the recorded-run lookup selected when no recorded run satisfies the request", async () => {
    const { ownFile, descendantFile } = sampleDispatchValue(
      TEST_DISPATCH_GENERATOR.nestedFiles(typescriptTestingLanguage),
    );

    await withRecordedRunRepository(ownFile, async (repository) => {
      const deps = await arrangeLateArrivingTestFile(repository, descendantFile);

      const result = await runTestsCommand({ productDir: repository.productDir, passing: false }, deps);

      expect(result.kind).toBe(TEST_RESULT_KIND.EXECUTED);
      const dispatchedPaths = repository.runner.calls.flatMap((call) => call.args);
      expect(dispatchedPaths).toContain(ownFile);
      expect(dispatchedPaths).not.toContain(descendantFile);
    });
  });

  it("reports only the files the recorded-run lookup selected when a recorded run satisfies the request", async () => {
    const { ownFile, descendantFile } = sampleDispatchValue(
      TEST_DISPATCH_GENERATOR.nestedFiles(typescriptTestingLanguage),
    );

    await withRecordedRunRepository(ownFile, async (repository) => {
      await recordPassedRun(repository);
      const invocationsAfterRecording = repository.runner.calls.length;
      const deps = await arrangeLateArrivingTestFile(repository, descendantFile);

      const result = await runTestsCommand({ productDir: repository.productDir, passing: false }, deps);

      expect(result.kind).toBe(TEST_RESULT_KIND.REUSED);
      expect(repository.runner.calls).toHaveLength(invocationsAfterRecording);
      expect(result.outcomes.flatMap((outcome) => outcome.testPaths)).toEqual([ownFile]);
    });
  });
});
