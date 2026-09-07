import { type Command, CommanderError, InvalidArgumentError } from "commander";

import type { Domain } from "@/interfaces/cli/domain";
import { SPX_COMMANDER_PARSE_SOURCE } from "@/interfaces/cli/product-context";
import { createCliProgram } from "@/interfaces/cli/program";
import { CLI_DOMAINS } from "@/interfaces/cli/registry";

export interface CliDiagnosticRun {
  /** Everything Commander wrote to the managed stderr adapter during the run. */
  readonly stderr: string;
  /** The Commander error the run raised, or `undefined` when the run succeeded. */
  readonly commanderError: CommanderError | undefined;
}

/** The command and flag of the harness domain whose option parser names the value it rejects. */
export const REJECTING_PARSER_CLI = {
  COMMAND: "reject",
  FLAG: "--value",
} as const;

/**
 * A domain with one option whose parser refuses every value and repeats it in the message it
 * throws. Commander appends that message to its own invalid-argument prefix, so the value reaches
 * the diagnostic twice — once where Commander embedded it and once where the parser did — and a
 * program that escapes only the prefix leaves the second copy raw.
 */
function rejectingParserDomain(): Domain {
  return {
    name: REJECTING_PARSER_CLI.COMMAND,
    description: "Rejects every value through its own parser",
    register: (program) => {
      program
        .command(REJECTING_PARSER_CLI.COMMAND)
        .option(`${REJECTING_PARSER_CLI.FLAG} <value>`, "A value the parser never accepts", (value: string) => {
          throw new InvalidArgumentError(`got ${value}`);
        })
        .action(() => undefined);
    },
  };
}

export interface CliDiagnosticOptions {
  /** Register the harness domain whose option parser repeats the rejected value in its own message. */
  readonly registerRejectingParser?: boolean;
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
    domains: [
      ...(options.registerProductionDomains === true ? CLI_DOMAINS : []),
      ...(options.registerRejectingParser === true ? [rejectingParserDomain()] : []),
    ],
    writeStderr: (output) => stderr.push(output),
  });
  captureEveryCommand(program);
  return program;
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
