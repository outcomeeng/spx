import { describe, expect, it } from "vitest";

import { runTestsCommand, TEST_RESULT_KIND } from "@/commands/test";
import { TESTING_CLI } from "@/interfaces/cli/test";
import { AGENT_TEST_OUTPUT_TEXT, formatAgentTestOutput } from "@/interfaces/cli/test-agent-output";
import { typescriptTestingLanguage } from "@/test/languages/typescript";
import { TEST_PATH_VERDICT } from "@/test/run-state";
import { sampleDispatchValue, TEST_DISPATCH_GENERATOR } from "@testing/generators/testing/dispatch";
import { runTestingCli, testingCliDeps } from "@testing/harnesses/testing/cli";
import {
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

  it("requires execution when the command line carries the no-reuse flag", async () => {
    const { file } = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodeWithOwnFile(typescriptTestingLanguage));

    await withRecordedRunRepository(file, async (repository) => {
      const run = await recordPassedRun(repository);
      const streamCalls: Parameters<typeof testingCliDeps>[3] = [];

      await runTestingCli(
        [TESTING_CLI.commandName, TESTING_CLI.noReuseFlag],
        testingCliDeps(repository.productDir, run, [], streamCalls),
      );

      expect(streamCalls).toEqual([{ productDir: repository.productDir, passing: false, requireExecution: true }]);
    });
  });

  it("reports the reused result in the compact agent summary and invokes no runner", async () => {
    const { file } = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodeWithOwnFile(typescriptTestingLanguage));

    await withRecordedRunRepository(file, async (repository) => {
      const recordedRun = await recordPassedRun(repository);
      const invocationsAfterRecording = repository.runner.calls.length;

      const result = await runTestsCommand({ productDir: repository.productDir, passing: false }, repository.deps);
      const summary = formatAgentTestOutput(result);

      expect(repository.runner.calls).toHaveLength(invocationsAfterRecording);
      expect(summary).toContain(`${AGENT_TEST_OUTPUT_TEXT.REUSED_RUN}: ${recordedRun.runFile.runFilePath}`);
      expect(summary).toContain(`${AGENT_TEST_OUTPUT_TEXT.TESTS}: 1`);
    });
  });
});
