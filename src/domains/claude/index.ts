/**
 * Claude domain - Manage Claude Code settings and plugins
 */
import { initCommand } from "@/commands/claude/init";
import { consolidateCommand } from "@/commands/claude/settings/consolidate";
import type { Command } from "commander";
import type { Domain } from "../types";

/**
 * Register claude domain commands
 *
 * @param claudeCmd - Commander.js claude domain command
 */
function registerClaudeCommands(claudeCmd: Command): void {
  // init command
  claudeCmd
    .command("init")
    .description("Initialize or update outcomeeng marketplace plugin")
    .action(async () => {
      try {
        const output = await initCommand({ cwd: process.cwd() });
        console.log(output);
      } catch (error) {
        console.error(
          "Error:",
          error instanceof Error ? error.message : String(error),
        );
        process.exit(1);
      }
    });

  // settings subcommand group
  const settingsCmd = claudeCmd
    .command("settings")
    .description("Manage Claude Code settings");

  // settings consolidate command
  settingsCmd
    .command("consolidate")
    .description(
      "Consolidate permissions from project-specific settings into global settings",
    )
    .option("--write", "Write changes to global settings file (default: preview only)")
    .option(
      "--output-file <path>",
      "Write merged settings to specified file instead of global settings",
    )
    .option(
      "--root <path>",
      "Root directory to scan for settings files (default: ~/Code)",
    )
    .option(
      "--global-settings <path>",
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
            console.error(
              "Error: --write and --output-file are mutually exclusive\n"
                + "Use --write to modify global settings, or --output-file to write to a different location",
            );
            process.exit(1);
          }

          const output = await consolidateCommand({
            write: options.write,
            outputFile: options.outputFile,
            root: options.root,
            globalSettings: options.globalSettings,
          });
          console.log(output);
        } catch (error) {
          console.error(
            "Error:",
            error instanceof Error ? error.message : String(error),
          );
          process.exit(1);
        }
      },
    );
}

/**
 * Claude domain - Manage Claude Code settings and plugins
 */
export const claudeDomain: Domain = {
  name: "claude",
  description: "Manage Claude Code settings and plugins",
  register: (program: Command) => {
    const claudeCmd = program
      .command("claude")
      .description("Manage Claude Code settings and plugins");

    registerClaudeCommands(claudeCmd);
  },
};
