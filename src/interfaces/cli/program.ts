import { Command } from "commander";

import { resolveProductDir } from "@/domains/config/root";
import type { Domain } from "@/domains/types";
import { CONFIG_PROCESS_CWD } from "@/lib/config/cwd";

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

export function createCliProgram(options: CliProgramOptions = {}): Command {
  const program = new Command();
  const io: CliIo = {
    writeStdout: options.writeStdout ?? DEFAULT_CLI_IO.writeStdout,
    writeStderr: options.writeStderr ?? DEFAULT_CLI_IO.writeStderr,
    setExitCode: options.setExitCode ?? DEFAULT_CLI_IO.setExitCode,
    exit: options.exit ?? DEFAULT_CLI_IO.exit,
  };

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
