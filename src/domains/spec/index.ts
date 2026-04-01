/**
 * Spec domain - Manage spec workflow
 */
import { access } from "node:fs/promises";
import { readFile, writeFile } from "node:fs/promises";

import type { Command } from "commander";

import { nextCommand } from "../../commands/spec/next.js";
import { type OutputFormat, statusCommand } from "../../commands/spec/status.js";
import { APPLY_HELP } from "../../spec/apply/exclude/help.js";
import { applyExcludeCommand } from "../../spec/apply/exclude/index.js";
import type { Domain } from "../types.js";

/**
 * Register spec domain commands
 *
 * @param specCmd - Commander.js spec domain command
 */
function registerSpecCommands(specCmd: Command): void {
  // status command
  specCmd
    .command("status")
    .description("Get project status")
    .option("--json", "Output as JSON")
    .option("--format <format>", "Output format (text|json|markdown|table)")
    .action(async (options: { json?: boolean; format?: string }) => {
      try {
        // Determine format: --json flag overrides --format option
        let format: OutputFormat = "text";
        if (options.json) {
          format = "json";
        } else if (options.format) {
          const validFormats = ["text", "json", "markdown", "table"];
          if (validFormats.includes(options.format)) {
            format = options.format as OutputFormat;
          } else {
            console.error(
              `Error: Invalid format "${options.format}". Must be one of: ${validFormats.join(", ")}`,
            );
            process.exit(1);
          }
        }

        const output = await statusCommand({ cwd: process.cwd(), format });
        console.log(output);
      } catch (error) {
        console.error(
          "Error:",
          error instanceof Error ? error.message : String(error),
        );
        process.exit(1);
      }
    });

  // next command
  specCmd
    .command("next")
    .description("Find next work item to work on")
    .action(async () => {
      try {
        const output = await nextCommand({ cwd: process.cwd() });
        console.log(output);
      } catch (error) {
        console.error(
          "Error:",
          error instanceof Error ? error.message : String(error),
        );
        process.exit(1);
      }
    });

  // apply command
  specCmd
    .command("apply")
    .description("Apply spec-tree state to project configuration")
    .addHelpText("after", APPLY_HELP)
    .action(async () => {
      const result = await applyExcludeCommand({
        cwd: process.cwd(),
        deps: {
          readFile: (path: string) => readFile(path, "utf-8"),
          writeFile: (path: string, content: string) => writeFile(path, content, "utf-8"),
          fileExists: async (path: string) => {
            try {
              await access(path);
              return true;
            } catch {
              return false;
            }
          },
        },
      });
      if (result.output) console.log(result.output);
      process.exit(result.exitCode);
    });
}

/**
 * Spec domain - Manage spec workflow
 */
export const specDomain: Domain = {
  name: "spec",
  description: "Manage spec workflow",
  register: (program: Command) => {
    const specCmd = program
      .command("spec")
      .description("Manage spec workflow");

    registerSpecCommands(specCmd);
  },
};
