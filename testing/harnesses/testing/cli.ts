import type { RecordedTestRun, TestDispatchResult } from "@/commands/test";
import { createCliProgram } from "@/interfaces/cli/program";
import { createTestingDomain, type TestingCliDependencies } from "@/interfaces/cli/test";
import type { TargetSelection } from "@/lib/test-targeting";
import { TEST_RUN_STATE_FIELDS, TEST_RUN_STATE_STATUS } from "@/test/run-state";
import { arbitraryDomainLiteral } from "@testing/generators/literal/literal";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { testingCliCommanderParseSource } from "@testing/generators/testing/dispatch";

export interface TestingCliCall {
  readonly productDir: string;
  readonly passing: boolean;
  readonly targets?: TargetSelection;
  readonly changed?: { readonly baseRef?: string; readonly staged?: boolean };
}

export interface TestingCliResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCodes: readonly number[];
}

class TestingCliExit extends Error {
  constructor(readonly exitCode: number) {
    super(`Testing CLI exited with code ${exitCode}`);
  }
}

function recordIdentity(): string {
  return sampleGeneratedValue(arbitraryDomainLiteral());
}

/**
 * The run the recording `runTests` and `runAgentTests` collaborators return for a given dispatch —
 * a real-shaped `RecordedTestRun` whose run-file and recorded-state identity fields are drawn
 * values the descriptor never inspects, so a CLI scenario observes only the dispatch it supplied.
 */
export function recordedTestRun(dispatch: TestDispatchResult): RecordedTestRun {
  return {
    dispatch,
    runFile: {
      runsDir: recordIdentity(),
      runFilePath: recordIdentity(),
      runFileName: recordIdentity(),
      runToken: recordIdentity(),
      runId: recordIdentity(),
      startedAt: recordIdentity(),
    },
    recorded: {
      branchName: recordIdentity(),
      headSha: recordIdentity(),
      testingConfigDigest: recordIdentity(),
      runnerOutcomes: [],
      discoveredTestPathsDigest: recordIdentity(),
      discoveredTestContentDigest: recordIdentity(),
      productInputDigests: [],
      startedAt: recordIdentity(),
      completedAt: recordIdentity(),
      [TEST_RUN_STATE_FIELDS.STATUS]: TEST_RUN_STATE_STATUS.FAILED,
    },
  };
}

export function testingCliDeps(
  productDir: string,
  run: RecordedTestRun,
  agentCalls: TestingCliCall[],
  streamCalls: TestingCliCall[],
): TestingCliDependencies {
  return {
    resolveProductDir: () => Promise.resolve(productDir),
    runTests: (resolvedProductDir, passing, targets, changed) => {
      streamCalls.push({
        productDir: resolvedProductDir,
        passing,
        ...(targets === undefined ? {} : { targets }),
        ...(changed === undefined ? {} : { changed }),
      });
      return Promise.resolve(run);
    },
    runAgentTests: (resolvedProductDir, passing, targets, changed) => {
      agentCalls.push({
        productDir: resolvedProductDir,
        passing,
        ...(targets === undefined ? {} : { targets }),
        ...(changed === undefined ? {} : { changed }),
      });
      return Promise.resolve(run);
    },
    writeStdout: () => undefined,
    writeWarning: () => undefined,
    setExitCode: () => undefined,
    exit: () => {
      throw new Error("Unexpected testing CLI process exit in base dependency fixture");
    },
  };
}

export async function runTestingCli(
  args: readonly string[],
  deps: TestingCliDependencies,
): Promise<TestingCliResult> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exitCodes: number[] = [];
  const domain = createTestingDomain({
    ...deps,
    writeStdout: (output) => stdout.push(output),
    writeWarning: (warning) => {
      if (warning !== undefined) stderr.push(`${warning}\n`);
    },
    setExitCode: (exitCode) => exitCodes.push(exitCode),
    exit: (exitCode) => {
      exitCodes.push(exitCode);
      throw new TestingCliExit(exitCode);
    },
  });
  const program = createCliProgram({ domains: [domain] });
  program.exitOverride();
  program.configureOutput({
    writeOut: (output) => stdout.push(output),
    writeErr: (output) => stderr.push(output),
  });

  try {
    await program.parseAsync([...args], { from: testingCliCommanderParseSource() });
  } catch (error) {
    if (!(error instanceof TestingCliExit)) throw error;
  }

  return { stdout: stdout.join(""), stderr: stderr.join(""), exitCodes };
}
