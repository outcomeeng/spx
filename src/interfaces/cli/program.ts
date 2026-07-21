import { Command, type ErrorOptions } from "commander";

import { resolveProductDir } from "@/domains/config/root";
import type { Domain } from "@/domains/types";
import { CONFIG_PROCESS_CWD } from "@/lib/config/cwd";
import { escapeCliArgument } from "@/lib/sanitize-cli-argument";

import { type CliIo, createCliInvocation, DEFAULT_CLI_IO, SPX_GLOBAL_OPTIONS } from "./product-context";
import { CLI_DOMAINS } from "./registry";

export const SPX_PROGRAM_NAME = "spx";
const SPX_PROGRAM_DESCRIPTION = "Fast, deterministic CLI tool for spec workflow management";

export type CliProgramOptions = Partial<CliIo> & {
  readonly domains?: readonly Domain[];
  readonly processCwd?: () => string;
  readonly version?: string;
};

type CliGlobalOptions = {
  readonly directory?: string;
};

/**
 * A Commander program that escapes the user-supplied portion of every error
 * message before Commander renders it, so terminal-control bytes echoed from an
 * unknown option or command cannot rewrite the terminal or forge a diagnostic
 * line. Subcommands inherit the behavior through `createCommand`. Escaping is
 * escape-only — it applies no length bound — so Commander's own multi-line
 * usage and help structure is preserved around the escaped message.
 */
class SafeDiagnosticCommand extends Command {
  override createCommand(name?: string): SafeDiagnosticCommand {
    return new SafeDiagnosticCommand(name);
  }

  override error(message: string, errorOptions?: ErrorOptions): never {
    return super.error(escapeCliArgument(message), errorOptions);
  }
}

export function createCliProgram(options: CliProgramOptions = {}): Command {
  const program = new SafeDiagnosticCommand();
  const io: CliIo = {
    writeStdout: options.writeStdout ?? DEFAULT_CLI_IO.writeStdout,
    writeStderr: options.writeStderr ?? DEFAULT_CLI_IO.writeStderr,
    setExitCode: options.setExitCode ?? DEFAULT_CLI_IO.setExitCode,
    exit: options.exit ?? DEFAULT_CLI_IO.exit,
  };
  program.configureOutput({ writeErr: io.writeStderr });

  program
    .name(SPX_PROGRAM_NAME)
    .description(SPX_PROGRAM_DESCRIPTION)
    .option(SPX_GLOBAL_OPTIONS.directory.flags, SPX_GLOBAL_OPTIONS.directory.description);

  if (options.version !== undefined) {
    program.version(options.version);
  }

  const invocation = createCliInvocation({
    readDirectoryOption: () => program.opts<CliGlobalOptions>().directory,
    processCwd: options.processCwd ?? CONFIG_PROCESS_CWD.read,
    resolveProductDir,
    writeWarning: (warning) => {
      if (warning !== undefined) {
        io.writeStderr(`${warning}\n`);
      }
    },
    io,
  });

  for (const domain of options.domains ?? CLI_DOMAINS) {
    domain.register(program, invocation);
  }

  return program;
}
