/**
 * Spec domain - Manage spec workflow
 */
import { access, readFile, writeFile } from "node:fs/promises";

import type { Command } from "commander";

import { nextCommand } from "@/commands/spec/next";
import { type OutputFormat, statusCommand } from "@/commands/spec/status";
import { APPLY_HELP } from "@/domains/spec/apply/exclude/help";
import { applyExcludeCommand } from "@/domains/spec/apply/exclude/index";
import type { Domain } from "../types";

const VALID_STATUS_FORMATS: readonly OutputFormat[] = [
  "text",
  "json",
  "markdown",
  "table",
];

function handleCommandError(error: unknown): never {
  console.error("Error:", error instanceof Error ? error.message : String(error));
  process.exit(1);
}

function resolveStatusFormat(options: { json?: boolean; format?: string }): OutputFormat {
  if (options.json === true) {
    return "json";
  }

  if (options.format === undefined) {
    return "text";
  }

  if (VALID_STATUS_FORMATS.includes(options.format as OutputFormat)) {
    return options.format as OutputFormat;
  }

  throw new Error(
    `Invalid format "${options.format}". Must be one of: ${VALID_STATUS_FORMATS.join(", ")}`,
  );
}

function registerSpecCommands(specCmd: Command): void {
  specCmd
    .command("status")
    .description("Get project status")
    .option("--json", "Output as JSON")
    .option("--format <format>", "Output format (text|json|markdown|table)")
    .action(async (options: { json?: boolean; format?: string }) => {
      try {
        const output = await statusCommand({
          cwd: process.cwd(),
          format: resolveStatusFormat(options),
        });
        console.log(output);
      } catch (error) {
        handleCommandError(error);
      }
    });

  specCmd
    .command("next")
    .description("Find next work item to work on")
    .action(async () => {
      try {
        const output = await nextCommand({ cwd: process.cwd() });
        console.log(output);
      } catch (error) {
        handleCommandError(error);
      }
    });

  specCmd
    .command("apply")
    .description("Apply spec-tree state to project configuration")
    .addHelpText("after", APPLY_HELP)
    .action(async () => {
      try {
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
      } catch (error) {
        handleCommandError(error);
      }
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
