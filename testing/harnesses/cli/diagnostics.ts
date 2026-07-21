import { type Command, CommanderError } from "commander";

import { SPX_COMMANDER_PARSE_SOURCE } from "@/interfaces/cli/product-context";
import { createCliProgram } from "@/interfaces/cli/program";
import { CLI_DOMAINS } from "@/interfaces/cli/registry";

export interface CliDiagnosticRun {
  /** Everything Commander wrote to the managed stderr adapter during the run. */
  readonly stderr: string;
  /** The Commander error the run raised, or `undefined` when the run succeeded. */
  readonly commanderError: CommanderError | undefined;
}

export interface CliDiagnosticOptions {
  /**
   * Register the production domain registry so Commander builds every subcommand
   * through the program's own `createCommand`. Left off, the program carries no
   * subcommands and an unknown option is diagnosed by the top-level program.
   */
  readonly registerProductionDomains?: boolean;
}

/**
 * Commander copies exit and help settings into a subcommand when the subcommand
 * is constructed, so settings applied to an already-populated program never
 * reach it. Domains register during `createCliProgram`, which is before the
 * harness can configure anything — so capture settings are applied to every
 * command in the finished tree instead.
 */
function captureEveryCommand(command: Command): void {
  command.exitOverride();
  command.showHelpAfterError();
  for (const subcommand of command.commands) {
    captureEveryCommand(subcommand);
  }
}

/**
 * A program wired to capture rather than terminate: stderr accumulates in the
 * supplied buffer through the managed adapter, and `exitOverride` converts
 * Commander's process exit into a throw the caller can observe.
 */
function createCapturingProgram(stderr: string[], options: CliDiagnosticOptions): Command {
  const program = createCliProgram({
    domains: options.registerProductionDomains === true ? CLI_DOMAINS : [],
    writeStderr: (output) => stderr.push(output),
  });
  captureEveryCommand(program);
  return program;
}

function captureCommanderError(run: () => void): CommanderError | undefined {
  try {
    run();
    return undefined;
  } catch (error) {
    if (!(error instanceof CommanderError)) throw error;
    return error;
  }
}

/** Parse `argv` through the CLI program and return everything it diagnosed. */
export async function runCliDiagnostic(
  argv: readonly string[],
  options: CliDiagnosticOptions = {},
): Promise<CliDiagnosticRun> {
  const stderr: string[] = [];
  const program = createCapturingProgram(stderr, options);
  let commanderError: CommanderError | undefined;
  try {
    await program.parseAsync(argv, { from: SPX_COMMANDER_PARSE_SOURCE });
  } catch (error) {
    if (!(error instanceof CommanderError)) throw error;
    commanderError = error;
  }
  return { stderr: stderr.join(""), commanderError };
}

/** Raise `message` through the program's own `error` path and return what it diagnosed. */
export function runCliErrorDiagnostic(message: string): CliDiagnosticRun {
  const stderr: string[] = [];
  const program = createCapturingProgram(stderr, {});
  const commanderError = captureCommanderError(() => program.error(message));
  return { stderr: stderr.join(""), commanderError };
}
