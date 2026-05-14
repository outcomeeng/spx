/**
 * Spec domain - Manage spec workflow
 */
import type { Command } from "commander";

import { nextCommand } from "@/commands/spec/next";
import { OUTPUT_FORMAT, type OutputFormat, statusCommand } from "@/commands/spec/status";
import type { Domain } from "../types";

export const SPEC_DOMAIN_CLI = {
  COMMAND: "spec",
  STATUS_COMMAND: "status",
  NEXT_COMMAND: "next",
  JSON_OPTION: "--json",
  FORMAT_OPTION_FLAG: "--format",
  FORMAT_OPTION_DEFINITION: "--format <format>",
} as const;

export const RETIRED_SPEC_DOMAIN_CLI = {
  APPLY_COMMAND: "apply",
} as const;

export const SPEC_STATUS_FORMAT_MESSAGE = {
  INVALID_PREFIX: "Invalid format",
} as const;

export const SPEC_DOMAIN_CLI_MESSAGE = {
  UNKNOWN_COMMAND_PREFIX: "error: unknown command",
} as const;

const VALID_STATUS_FORMATS: readonly OutputFormat[] = [
  OUTPUT_FORMAT.TEXT,
  OUTPUT_FORMAT.JSON,
  OUTPUT_FORMAT.MARKDOWN,
  OUTPUT_FORMAT.TABLE,
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
    `${SPEC_STATUS_FORMAT_MESSAGE.INVALID_PREFIX} "${options.format}". Must be one of: ${
      VALID_STATUS_FORMATS.join(", ")
    }`,
  );
}

function registerSpecCommands(specCmd: Command): void {
  specCmd
    .command(SPEC_DOMAIN_CLI.STATUS_COMMAND)
    .description("Get product status")
    .option(SPEC_DOMAIN_CLI.JSON_OPTION, "Output as JSON")
    .option(SPEC_DOMAIN_CLI.FORMAT_OPTION_DEFINITION, "Output format (text|json|markdown|table)")
    .action(async (options: { json?: boolean; format?: string }) => {
      try {
        const output = await statusCommand({
          cwd: process.cwd(),
          format: resolveStatusFormat(options),
          onWarning: writeWarning,
        });
        console.log(output);
      } catch (error) {
        handleCommandError(error);
      }
    });

  specCmd
    .command(SPEC_DOMAIN_CLI.NEXT_COMMAND)
    .description("Find next spec-tree node to work on")
    .action(async () => {
      try {
        const output = await nextCommand({ cwd: process.cwd(), onWarning: writeWarning });
        console.log(output);
      } catch (error) {
        handleCommandError(error);
      }
    });
}

function writeWarning(warning: string): void {
  console.error(warning);
}

/**
 * Spec domain - Manage spec workflow
 */
export const specDomain: Domain = {
  name: "spec",
  description: "Manage spec workflow",
  register: (program: Command) => {
    const specCmd = program
      .command(SPEC_DOMAIN_CLI.COMMAND)
      .description("Manage spec workflow");

    registerSpecCommands(specCmd);
  },
};
