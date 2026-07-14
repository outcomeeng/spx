/**
 * Claude domain - Manage Claude Code settings and plugins
 */
import { initCommand } from "@/commands/claude/init";
import { consolidateCommand } from "@/commands/claude/settings/consolidate";
import { CLAUDE_SETTINGS_PATH } from "@/domains/claude/settings/files";
import type { ConsolidationReportUsage } from "@/domains/claude/settings/reporter";
import type { Domain } from "@/domains/types";
import { CLI_EXIT_CODE, SPX_PROGRAM_NAME } from "@/interfaces/cli/invocation";
import type { CliInvocation, CliIo } from "@/interfaces/cli/product-context";
import type { Command } from "commander";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export const CLAUDE_SETTINGS_CLI = {
  DOMAIN: "claude",
  SETTINGS_COMMAND: "settings",
  CONSOLIDATE_COMMAND: "consolidate",
  OPTION: {
    WRITE: { token: "--write" },
    OUTPUT_FILE: { token: "--output-file", operand: "<path>" },
    ROOT: { token: "--root", operand: "<path>" },
    GLOBAL_SETTINGS: { token: "--global-settings", operand: "<path>" },
  },
} as const;

export const CLAUDE_SETTINGS_MUTUAL_EXCLUSION_ERROR =
  `Error: ${CLAUDE_SETTINGS_CLI.OPTION.WRITE.token} and ${CLAUDE_SETTINGS_CLI.OPTION.OUTPUT_FILE.token} are mutually exclusive\n`
  + `Use ${CLAUDE_SETTINGS_CLI.OPTION.WRITE.token} to modify global settings, or ${CLAUDE_SETTINGS_CLI.OPTION.OUTPUT_FILE.token} to write to a different location`;

function optionDefinition(option: { readonly token: string; readonly operand?: string }): string {
  return option.operand === undefined ? option.token : `${option.token} ${option.operand}`;
}

function consolidationReportUsage(): ConsolidationReportUsage {
  const commandPath = [
    CLAUDE_SETTINGS_CLI.DOMAIN,
    CLAUDE_SETTINGS_CLI.SETTINGS_COMMAND,
    CLAUDE_SETTINGS_CLI.CONSOLIDATE_COMMAND,
  ].join(" ");
  return {
    writeGlobalSettings: `${SPX_PROGRAM_NAME} ${commandPath} ${optionDefinition(CLAUDE_SETTINGS_CLI.OPTION.WRITE)}`,
    writeOutputFile: `${SPX_PROGRAM_NAME} ${commandPath} ${optionDefinition(CLAUDE_SETTINGS_CLI.OPTION.OUTPUT_FILE)}`,
  };
}

function resolveSettingsPath(input: string, effectiveInvocationDir: string, homeDir: string): string {
  const expanded = input === "~"
    ? homeDir
    : input.startsWith("~/")
    ? join(homeDir, input.slice(2))
    : input;
  return resolve(effectiveInvocationDir, expanded);
}

function homeRelativePath(...segments: readonly string[]): string {
  return ["~", ...segments].join("/");
}

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
  return io.exit(CLI_EXIT_CODE.ERROR);
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
      optionDefinition(CLAUDE_SETTINGS_CLI.OPTION.WRITE),
      "Write changes to global settings file (default: preview only)",
    )
    .option(
      optionDefinition(CLAUDE_SETTINGS_CLI.OPTION.OUTPUT_FILE),
      "Write merged settings to specified file instead of global settings",
    )
    .option(
      optionDefinition(CLAUDE_SETTINGS_CLI.OPTION.ROOT),
      `Root directory to scan for settings files (default: ${
        homeRelativePath(CLAUDE_SETTINGS_PATH.DEFAULT_SCAN_DIRECTORY)
      })`,
    )
    .option(
      optionDefinition(CLAUDE_SETTINGS_CLI.OPTION.GLOBAL_SETTINGS),
      `Path to global settings file (default: ${
        homeRelativePath(
          CLAUDE_SETTINGS_PATH.DIRECTORY,
          CLAUDE_SETTINGS_PATH.GLOBAL_FILE,
        )
      })`,
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

          const effectiveInvocationDir = invocation.resolveEffectiveInvocationDir();
          const homeDir = homedir();
          const root = resolveSettingsPath(
            options.root ?? join(homeDir, CLAUDE_SETTINGS_PATH.DEFAULT_SCAN_DIRECTORY),
            effectiveInvocationDir,
            homeDir,
          );
          const globalSettings = resolveSettingsPath(
            options.globalSettings
              ?? join(
                homeDir,
                CLAUDE_SETTINGS_PATH.DIRECTORY,
                CLAUDE_SETTINGS_PATH.GLOBAL_FILE,
              ),
            effectiveInvocationDir,
            homeDir,
          );
          const outputFile = options.outputFile === undefined
            ? undefined
            : resolveSettingsPath(options.outputFile, effectiveInvocationDir, homeDir);

          const output = await consolidateCommand({
            write: options.write,
            outputFile,
            root,
            globalSettings,
            now: () => new Date(),
            usage: consolidationReportUsage(),
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
