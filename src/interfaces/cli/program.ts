import { Command } from "commander";

import { resolveProductDir } from "@/domains/config/root";
import type { Domain } from "@/interfaces/cli/domain";
import { CONFIG_PROCESS_CWD } from "@/lib/config/cwd";
import { escapeCliArgument } from "@/lib/sanitize-cli-argument";
import { renderTerminalText, terminal } from "@/lib/terminal-text/terminal-text";

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
 * Commander builds each diagnostic itself, fusing its own words with whatever the caller typed,
 * so by the time a message reaches `error` the two are no longer separable. These two hooks are
 * where they are still apart: every other diagnostic Commander raises embeds only declarations
 * the product wrote — an option's flags, an argument's name, the command's own name, a count.
 * Commander marks both `@api private` and omits them from its published typings; this states the
 * runtime shape the overrides bind to.
 */
declare module "commander" {
  interface Command {
    unknownOption(flag: string): void;
    unknownCommand(): void;
  }
}

/**
 * A Commander program that escapes the caller-supplied token where Commander embeds it, so
 * terminal-control bytes echoed from an unknown option or command cannot rewrite the terminal
 * or forge a diagnostic line, while the diagnostic Commander composes around that token — its
 * newline before a suggestion, its usage and help blocks — keeps its own bytes. Subcommands
 * inherit the behavior through `createCommand`. Escaping is escape-only and leaves printable
 * input untouched, so Commander's near-match suggestions are unchanged for ordinary tokens.
 */
class SafeDiagnosticCommand extends Command {
  override createCommand(name?: string): SafeDiagnosticCommand {
    return new SafeDiagnosticCommand(name);
  }

  override unknownOption(flag: string): void {
    super.unknownOption(escapeCliArgument(flag));
  }

  override unknownCommand(): void {
    // The unknown name is read from `args` rather than passed, so it is escaped in place. The
    // call below never returns, which is why rewriting the parsed operands here reaches nothing.
    const [unknownName, ...remainingArgs] = this.args;
    this.args = [escapeCliArgument(unknownName), ...remainingArgs];
    super.unknownCommand();
  }
}

export function createCliProgram(options: CliProgramOptions = {}): Command {
  const program = new SafeDiagnosticCommand();
  const io: CliIo = {
    writeStdout: options.writeStdout ?? DEFAULT_CLI_IO.writeStdout,
    writeStderr: options.writeStderr ?? DEFAULT_CLI_IO.writeStderr,
    // Pass-through and composed output share one stream, so a caller that redirects standard
    // output receives both unless it redirects the relay separately. The two stay distinct in the
    // type — one claims control-byte safety and the other does not — not in their destination.
    writePassThrough: options.writePassThrough ?? options.writeStdout ?? DEFAULT_CLI_IO.writePassThrough,
    writePassThroughError: options.writePassThroughError ?? options.writeStderr
      ?? DEFAULT_CLI_IO.writePassThroughError,
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
        io.writeStderr(renderTerminalText(terminal`${warning}\n`));
      }
    },
    io,
  });

  for (const domain of options.domains ?? CLI_DOMAINS) {
    domain.register(program, invocation);
  }

  return program;
}
