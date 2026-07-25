import type { Command } from "commander";

import { defaultsCommand } from "@/commands/config/defaults";
import { showCommand } from "@/commands/config/show";
import type { CliDeps, CliResult, ShowOptions, ValidateOptions } from "@/commands/config/types";
import { validateCommand } from "@/commands/config/validate";
import {
  CONFIG_FILE_FORMAT,
  DEFAULT_CONFIG_FILE_FORMAT,
  DEFAULT_CONFIG_FILENAME,
  readProductConfigFile,
  resolveConfig,
  resolveConfigFromReadResult,
} from "@/config/index";
import { productionRegistry } from "@/config/registry";

import type { Domain } from "@/interfaces/cli/domain";
import type { CliInvocation, CliIo } from "@/interfaces/cli/product-context";

export const CONFIG_CLI = {
  commandName: "config",
  commands: {
    defaults: "defaults",
    show: "show",
    validate: "validate",
  },
  flags: {
    json: "--json",
  },
} as const;

function buildDefaultDeps(invocation: CliInvocation): CliDeps {
  return {
    resolveConfig,
    readProductConfigFile,
    resolveConfigFromReadResult,
    resolveProductDir: (): string => invocation.resolveProductContext().productDir,
    descriptors: productionRegistry,
  };
}

async function emit(result: CliResult, io: CliIo): Promise<never> {
  if (result.stdout.length > 0) {
    io.writeStdout(result.stdout);
  }
  if (result.stderr.length > 0) {
    io.writeStderr(result.stderr);
  }
  return io.exit(result.exitCode);
}

function registerConfigCommands(configCmd: Command, invocation: CliInvocation): void {
  configCmd
    .command(CONFIG_CLI.commands.show)
    .description(
      `Print the resolved configuration as ${DEFAULT_CONFIG_FILE_FORMAT.toUpperCase()} `
        + `(or ${CONFIG_FILE_FORMAT.JSON.toUpperCase()} with ${CONFIG_CLI.flags.json})`,
    )
    .option(CONFIG_CLI.flags.json, `Output as ${CONFIG_FILE_FORMAT.JSON.toUpperCase()}`)
    .action(async (options: ShowOptions) => {
      await emit(await showCommand(options, buildDefaultDeps(invocation)), invocation.io);
    });

  configCmd
    .command(CONFIG_CLI.commands.validate)
    .description(`Verify that ${DEFAULT_CONFIG_FILENAME} passes every registered descriptor's validator`)
    .action(async (options: ValidateOptions) => {
      await emit(await validateCommand(options, buildDefaultDeps(invocation)), invocation.io);
    });

  configCmd
    .command(CONFIG_CLI.commands.defaults)
    .description(`Print each registered descriptor's defaults; ignores ${DEFAULT_CONFIG_FILENAME}`)
    .option(CONFIG_CLI.flags.json, `Output as ${CONFIG_FILE_FORMAT.JSON.toUpperCase()}`)
    .action(async (options: ShowOptions) => {
      await emit(await defaultsCommand(options, buildDefaultDeps(invocation)), invocation.io);
    });
}

export const configDomain: Domain = {
  name: "config",
  description: "Inspect and validate the resolved spx configuration",
  register: (program: Command, invocation: CliInvocation) => {
    const configCmd = program
      .command(CONFIG_CLI.commandName)
      .description("Inspect and validate the resolved spx configuration");
    registerConfigCommands(configCmd, invocation);
  },
};
