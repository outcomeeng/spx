/**
 * Claude domain - Manage Claude Code settings and plugins
 */
import { initCommand } from "@/commands/claude/init";
import { consolidateCommand } from "@/commands/claude/settings/consolidate";
import type { Domain } from "@/domains/types";
import { CLI_EXIT_CODE } from "@/interfaces/cli/invocation";
import type { CliInvocation, CliIo } from "@/interfaces/cli/product-context";
import type { Command } from "commander";

export const CLAUDE_SETTINGS_CLI = {
  DOMAIN: "claude",
  SETTINGS_COMMAND: "settings",
  CONSOLIDATE_COMMAND: "consolidate",
  OPTION: {
    WRITE: { flag: "--write", definition: "--write" },
    OUTPUT_FILE: { flag: "--output-file", definition: "--output-file <path>" },
    ROOT: { flag: "--root", definition: "--root <path>" },
    GLOBAL_SETTINGS: {
      flag: "--global-settings",
      definition: "--global-settings <path>",
    },
  },
} as const;

export const CLAUDE_SETTINGS_MUTUAL_EXCLUSION_ERROR = "Error: --write and --output-file are mutually exclusive\n"
  + "Use --write to modify global settings, or --output-file to write to a different location";

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "Unknown error";
}

function writeOutput(io: CliIo, output: string): void {
  io.writeStdout(`${output}\n`);
}

function writeError(io: CliIo, output: string): void {
  io.writeStderr(`${output}\n`);
}

function exitWithError(io: CliIo, error: unknown): never {
  writeError(io, `Error: ${formatError(error)}`);
  return io.exit(1);
}

/**
 * Register claude domain commands
 *
 * @param claudeCmd - Commander.js claude domain command
 */
function registerClaudeCommands(claudeCmd: Command, invocation: CliInvocation): void {
  const productDir = (): string => invocation.resolveProductContext().productDir;

  // init command
  claudeCmd
    .command("init")
    .description("Initialize or update outcomeeng marketplace plugin")
    .action(async () => {
      try {
        const output = await initCommand({ cwd: productDir() });
        writeOutput(invocation.io, output);
      } catch (error) {
        exitWithError(invocation.io, error);
      }
    });

  // settings subcommand group
  const settingsCmd = claudeCmd
    .command(CLAUDE_SETTINGS_CLI.SETTINGS_COMMAND)
    .description("Manage Claude Code settings");

  // settings consolidate command
  settingsCmd
    .command(CLAUDE_SETTINGS_CLI.CONSOLIDATE_COMMAND)
    .description(
      "Consolidate permissions from project-specific settings into global settings",
    )
    .option(
      CLAUDE_SETTINGS_CLI.OPTION.WRITE.definition,
      "Write changes to global settings file (default: preview only)",
    )
    .option(
      CLAUDE_SETTINGS_CLI.OPTION.OUTPUT_FILE.definition,
      "Write merged settings to specified file instead of global settings",
    )
    .option(
      CLAUDE_SETTINGS_CLI.OPTION.ROOT.definition,
      "Root directory to scan for settings files (default: ~/Code)",
    )
    .option(
      CLAUDE_SETTINGS_CLI.OPTION.GLOBAL_SETTINGS.definition,
      "Path to global settings file (default: ~/.claude/settings.json)",
    )
    .action(
      async (options: {
        write?: boolean;
        outputFile?: string;
        root?: string;
        globalSettings?: string;
      }) => {
        try {
          // Validate mutually exclusive options
          if (options.write && options.outputFile) {
            writeError(invocation.io, CLAUDE_SETTINGS_MUTUAL_EXCLUSION_ERROR);
            return invocation.io.exit(CLI_EXIT_CODE.ERROR);
          }

          const output = await consolidateCommand({
            write: options.write,
            outputFile: options.outputFile,
            root: options.root,
            globalSettings: options.globalSettings,
          });
          writeOutput(invocation.io, output);
        } catch (error) {
          exitWithError(invocation.io, error);
        }
      },
    );
}

/**
 * Claude domain - Manage Claude Code settings and plugins
 */
export const claudeDomain: Domain = {
  name: CLAUDE_SETTINGS_CLI.DOMAIN,
  description: "Manage Claude Code settings and plugins",
  register: (program: Command, invocation: CliInvocation) => {
    const claudeCmd = program
      .command(CLAUDE_SETTINGS_CLI.DOMAIN)
      .description("Manage Claude Code settings and plugins");

    registerClaudeCommands(claudeCmd, invocation);
  },
};
