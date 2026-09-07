import { type Argument, Command, InvalidArgumentError, type Option } from "commander";

import { resolveProductDir } from "@/domains/config/root";
import type { Domain } from "@/interfaces/cli/domain";
import { CONFIG_PROCESS_CWD } from "@/lib/config/cwd";
import { externalValue, renderTerminalText, terminal } from "@/lib/terminal-text/terminal-text";

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
 * so by the time a message reaches `error` the two are no longer separable. These three hooks are
 * where they are still apart: every other diagnostic Commander raises embeds only declarations
 * the product wrote — an option's flags, an argument's name, the command's own name, a count.
 * Commander marks all three `@api private` and omits them from its published typings, as it omits
 * the parser an argument carries; this states the runtime shape the overrides bind to.
 */
declare module "commander" {
  interface Argument {
    parseArg?: <T>(value: string, previous: T) => T;
  }
  interface Command {
    unknownOption(flag: string): void;
    unknownCommand(): void;
    _callParseArg(
      target: Option | Argument,
      value: string,
      previous: unknown,
      invalidArgumentMessage: string,
    ): unknown;
  }
}

/**
 * Decides a caller-supplied token as external and renders it back to the string Commander takes.
 * Commander composes the diagnostic itself, so the token cannot be spliced as composed text; the
 * decision still goes through the composition primitive rather than the escaper directly.
 */
function escapedToken(value: string): string {
  return renderTerminalText(externalValue(value));
}

/**
 * Restates a message Commander composed with every occurrence of the caller's value in escaped
 * form. The substitution runs only when escaping changed the value, and a value that changed
 * carries a byte no flags string, argument name, or command name the product declared around it
 * can hold, so no declared text is touched. An empty value is left alone — there is no byte in it
 * to rewrite the terminal with, and the escaper answers it with a sentinel that would replace
 * Commander's quoted empty argument with prose the caller never typed. The replacement is supplied
 * as a function so the escaped text is spliced literally: handed over as a string, `$&` or `$'`
 * inside it would be read as a substitution pattern and paste the raw match — control byte
 * included — back into the diagnostic.
 */
function withEscapedValue(message: string, value: string): string {
  const escapedValue = escapedToken(value);
  if (value.length === 0 || escapedValue === value) return message;
  return message.replaceAll(value, () => escapedValue);
}

/**
 * A Commander program that escapes the caller-supplied token where Commander embeds it, so
 * terminal-control bytes echoed from an unknown option or command cannot rewrite the terminal
 * or forge a diagnostic line, while the diagnostic Commander composes around that token — its
 * newline before a suggestion, its usage and help blocks — keeps its own bytes. Subcommands
 * inherit the behavior through `createCommand`. Escaping is escape-only and leaves printable
 * input untouched, so Commander's near-match suggestions are unchanged for ordinary tokens.
 *
 * The value an option or argument rejects arrives the same way: Commander writes it into the
 * invalid-argument message before any handler sees it, and the parse hook is the last place the
 * value is still a separate parameter, whether it came from argv or from the environment
 * variable an option declares.
 */
class SafeDiagnosticCommand extends Command {
  override createCommand(name?: string): SafeDiagnosticCommand {
    return new SafeDiagnosticCommand(name);
  }

  override unknownOption(flag: string): void {
    super.unknownOption(escapedToken(flag));
  }

  override unknownCommand(): void {
    // The unknown name is read from `args` rather than passed, so it is escaped in place. The
    // call below never returns, which is why rewriting the parsed operands here reaches nothing.
    const [unknownName, ...remainingArgs] = this.args;
    this.args = [escapedToken(unknownName), ...remainingArgs];
    super.unknownCommand();
  }

  // Commander's own body, with the escaping applied over the whole message it would raise: the
  // prefix Commander composed and the text the parser threw, since a parser that names the value
  // it rejected embeds it a second time. Delegating to the base would escape only the prefix.
  override _callParseArg(
    target: Option | Argument,
    value: string,
    previous: unknown,
    invalidArgumentMessage: string,
  ): unknown {
    try {
      return target.parseArg?.(value, previous);
    } catch (error) {
      if (error instanceof InvalidArgumentError) {
        const message = withEscapedValue(`${invalidArgumentMessage} ${error.message}`, value);
        this.error(message, { exitCode: error.exitCode, code: error.code });
      }
      throw error;
    }
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
