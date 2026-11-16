import { type Command, CommanderError } from "commander";

import { VERIFY_CLI_EXIT_CODE } from "@/commands/verify/cli";
import type { CliCommandResult } from "@/config/types";
import type { Domain } from "@/interfaces/cli/domain";
import { SPX_COMMANDER_PARSE_SOURCE } from "@/interfaces/cli/product-context";
import { createCliProgram } from "@/interfaces/cli/program";
import { registerVerifyCommands, VERIFICATION_RUN_CLI_SURFACE, type VerifyCliHandlers } from "@/interfaces/cli/verify";
import { sampleStateStoreTestValue, STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";

/**
 * What parsing one `spx` invocation through the verification command family produced, with every
 * verification handler replaced by one that only counts its calls: whether Commander rejected the
 * invocation, the exit code of that rejection, everything written to standard error, and how many
 * times any verification handler ran. It carries no expected value; the test that hands the
 * invocation over derives what the diagnostic must name.
 */
export interface VerificationInvocationObservation {
  readonly rejected: boolean;
  readonly exitCode: number;
  readonly stderr: string;
  readonly handlerInvocationCount: number;
}

function installCommanderExitOverride(command: Command): void {
  command.exitOverride();
  command.commands.forEach((childCommand) => installCommanderExitOverride(childCommand));
}

function countingVerifyHandlers(count: () => void): VerifyCliHandlers {
  const counted = (): Promise<CliCommandResult> => {
    count();
    return Promise.resolve({ exitCode: VERIFY_CLI_EXIT_CODE.OK, output: JSON.stringify({}) });
  };
  return {
    appendFinding: counted,
    appendScope: counted,
    compare: counted,
    executeRun: async () => {
      count();
      return { exitCode: VERIFY_CLI_EXIT_CODE.OK };
    },
    finish: counted,
    input: counted,
    list: counted,
    paths: counted,
    reconcile: counted,
    render: counted,
    start: counted,
    status: counted,
  };
}

/**
 * Parse `argv` — the command path and options after the program name — through a CLI program whose
 * only domain is the verification family bound to counting handlers, from a drawn product
 * directory, and observe the outcome.
 */
export async function observeVerificationInvocation(
  argv: readonly string[],
): Promise<VerificationInvocationObservation> {
  const productDir = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.productRoot());
  let handlerInvocationCount = 0;
  const handlers = countingVerifyHandlers(() => {
    handlerInvocationCount += 1;
  });
  const stderr: string[] = [];
  const domain: Domain = {
    name: VERIFICATION_RUN_CLI_SURFACE.rootCommandName,
    description: VERIFICATION_RUN_CLI_SURFACE.rootCommandName,
    register: (program, invocation) => registerVerifyCommands(program, invocation, handlers),
  };
  const program = createCliProgram({
    domains: [domain],
    processCwd: () => productDir,
    setExitCode: () => undefined,
    writeStderr: (output) => stderr.push(output),
    writeStdout: () => undefined,
  });
  installCommanderExitOverride(program);
  program.configureOutput({ writeOut: () => undefined });

  try {
    await program.parseAsync([...argv], { from: SPX_COMMANDER_PARSE_SOURCE });
    return { rejected: false, exitCode: VERIFY_CLI_EXIT_CODE.OK, stderr: stderr.join(""), handlerInvocationCount };
  } catch (error) {
    if (!(error instanceof CommanderError)) throw error;
    return { rejected: true, exitCode: error.exitCode, stderr: stderr.join(""), handlerInvocationCount };
  }
}
