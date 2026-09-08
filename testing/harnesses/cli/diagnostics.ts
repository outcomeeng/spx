import { type Command, CommanderError, InvalidArgumentError, Option } from "commander";

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

/**
 * The command and flags of the harness domain whose option parsers name the value they reject:
 * one repeats it verbatim, the other recases it first.
 */
export const REJECTING_PARSER_CLI = {
  COMMAND: "reject",
  FLAG: "--value",
  REFORMATTING_FLAG: "--recased",
} as const;

/**
 * A domain with two options whose parsers refuse every value and name it in the message they
 * throw. Commander appends that message to its own invalid-argument prefix, so the value reaches
 * the diagnostic twice — once where Commander embedded it and once where the parser did — and a
 * program that escapes only the prefix leaves the second copy raw. The recasing parser names a
 * transformed copy, which a program that escapes by searching the message for the raw value
 * never finds, while the copy's control bytes survive the transformation.
 */
function rejectingParserDomain(): Domain {
  return {
    name: REJECTING_PARSER_CLI.COMMAND,
    description: "Rejects every value through its own parsers",
    register: (program) => {
      program
        .command(REJECTING_PARSER_CLI.COMMAND)
        .option(`${REJECTING_PARSER_CLI.FLAG} <value>`, "A value the parser never accepts", (value: string) => {
          throw new InvalidArgumentError(`got ${value}`);
        })
        .option(
          `${REJECTING_PARSER_CLI.REFORMATTING_FLAG} <value>`,
          "A value the parser never accepts and recases before naming",
          (value: string) => {
            throw new InvalidArgumentError(`got ${value.toUpperCase()}`);
          },
        )
        .action(() => undefined);
    },
  };
}

/**
 * The commands, argument, and flags of the harness domain whose diagnostics Commander composes
 * from declarations alone. Its paths are the ones Commander raises besides the three the program
 * overrides: a missing required argument, an option missing its argument, a mandatory option left
 * unspecified, two conflicting options, excess arguments, and help requested for an unknown
 * command.
 */
export const DECLARED_TEXT_CLI = {
  COMMAND: "declared",
  CONFLICT_COMMAND: "conflict",
  REQUIRED_ARGUMENT: "<required>",
  MANDATORY_FLAG: "--must",
  LEFT_FLAG: "--left",
  RIGHT_FLAG: "--right",
  HELP_COMMAND: "help",
} as const;

/**
 * A domain reaching every diagnostic Commander raises without handing the program the caller's
 * token. The caller's bytes sit in argv beside the path each diagnostic takes, so a diagnostic
 * that embedded anything beyond the names, flags, and counts the product declared would carry
 * them to stderr. Excess arguments are refused explicitly because Commander admits them by
 * default, which would leave that path unreachable.
 */
function declaredTextDomain(): Domain {
  return {
    name: DECLARED_TEXT_CLI.COMMAND,
    description: "Raises Commander's declaration-only diagnostics",
    register: (program) => {
      program
        .command(DECLARED_TEXT_CLI.COMMAND)
        .argument(DECLARED_TEXT_CLI.REQUIRED_ARGUMENT, "An operand the command requires")
        .requiredOption(`${DECLARED_TEXT_CLI.MANDATORY_FLAG} <value>`, "An option the command requires")
        .allowExcessArguments(false)
        .action(() => undefined);
      program
        .command(DECLARED_TEXT_CLI.CONFLICT_COMMAND)
        .addOption(
          new Option(`${DECLARED_TEXT_CLI.LEFT_FLAG} <value>`, "An option its sibling excludes").conflicts("right"),
        )
        .option(`${DECLARED_TEXT_CLI.RIGHT_FLAG} <value>`, "The sibling the first option excludes")
        .action(() => undefined);
    },
  };
}

export interface CliDiagnosticOptions {
  /** Register the harness domain whose option parser repeats the rejected value in its own message. */
  readonly registerRejectingParser?: boolean;
  /** Register the harness domain whose diagnostics Commander composes from declarations alone. */
  readonly registerDeclaredTextDomain?: boolean;
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
      ...(options.registerDeclaredTextDomain === true ? [declaredTextDomain()] : []),
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
