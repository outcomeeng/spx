import type { RecordedTestRun } from "@/commands/test";
import type { TargetSelection } from "@/domains/test";
import { createCliProgram } from "@/interfaces/cli/program";
import { createTestingDomain, type TestingCliDependencies } from "@/interfaces/cli/test";
import { testingCliCommanderParseSource } from "@testing/generators/testing/dispatch";

export interface TestingCliCall {
  readonly productDir: string;
  readonly passing: boolean;
  readonly targets?: TargetSelection;
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

export function testingCliDeps(
  productDir: string,
  run: RecordedTestRun,
  agentCalls: TestingCliCall[],
  streamCalls: TestingCliCall[],
): TestingCliDependencies {
  return {
    resolveProductDir: () => Promise.resolve(productDir),
    runTests: (resolvedProductDir, passing, targets) => {
      streamCalls.push({ productDir: resolvedProductDir, passing, ...(targets === undefined ? {} : { targets }) });
      return Promise.resolve(run);
    },
    runAgentTests: (resolvedProductDir, passing, targets) => {
      agentCalls.push({ productDir: resolvedProductDir, passing, ...(targets === undefined ? {} : { targets }) });
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
