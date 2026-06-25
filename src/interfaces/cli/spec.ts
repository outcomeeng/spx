import type { Command } from "commander";

import { nextCommand } from "@/commands/spec/next";
import { createNodeOutcomeResolver } from "@/commands/spec/node-outcome-resolver";
import { OUTPUT_FORMAT, type OutputFormat, statusCommand } from "@/commands/spec/status";
import type { Domain } from "@/domains/types";
import type { CliInvocation } from "@/interfaces/cli/product-context";
import { testingRegistry } from "@/test/registry";

import { createRunnerDepsFor } from "./test-runner-deps";
import { writeWarning } from "./write-warning";

export const SPEC_DOMAIN_CLI = {
  COMMAND: "spec",
  STATUS_COMMAND: "status",
  NEXT_COMMAND: "next",
  JSON_OPTION: "--json",
  FORMAT_OPTION_FLAG: "--format",
  FORMAT_OPTION_DEFINITION: "--format <format>",
  UPDATE_OPTION: "--update",
} as const;

export const SPEC_STATUS_FORMAT_MESSAGE = {
  INVALID_PREFIX: "Invalid format",
} as const;

const VALID_STATUS_FORMATS: readonly OutputFormat[] = [
  OUTPUT_FORMAT.TEXT,
  OUTPUT_FORMAT.JSON,
  OUTPUT_FORMAT.MARKDOWN,
  OUTPUT_FORMAT.TABLE,
];

const UNPRINTABLE_ERROR_MESSAGE = "unprintable error";

function handleCommandError(error: unknown): never {
  let message: string;
  if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === "string") {
    message = error;
  } else {
    try {
      message = JSON.stringify(error);
    } catch {
      message = UNPRINTABLE_ERROR_MESSAGE;
    }
  }
  console.error("Error:", message);
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

function registerSpecCommands(specCmd: Command, invocation: CliInvocation): void {
  const productDir = (): string => invocation.resolveProductContext().productDir;

  specCmd
    .command(SPEC_DOMAIN_CLI.STATUS_COMMAND)
    .description("Get product status")
    .option(SPEC_DOMAIN_CLI.JSON_OPTION, "Output as JSON")
    .option(SPEC_DOMAIN_CLI.FORMAT_OPTION_DEFINITION, "Output format (text|json|markdown|table)")
    .option(SPEC_DOMAIN_CLI.UPDATE_OPTION, "Refresh each node's spx.status.json before reporting")
    .action(async (options: { json?: boolean; format?: string; update?: boolean }) => {
      try {
        const format = resolveStatusFormat(options);
        // The per-node runner pipes child stdout to process.stderr here so stdout
        // carries only the status rollup; a --json rollup therefore stays parseable
        // even when --update runs a node's tests for stale, failing, or absent evidence.
        const output = options.update === true
          ? await statusCommand({
            cwd: productDir(),
            format,
            onWarning: writeWarning,
            update: true,
            resolveOutcomeFor: (productDir) =>
              createNodeOutcomeResolver({
                productDir,
                registry: testingRegistry,
                runnerDepsFor: createRunnerDepsFor(productDir, process.stderr),
              }),
          })
          : await statusCommand({ cwd: productDir(), format, onWarning: writeWarning });
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
        const output = await nextCommand({ cwd: productDir(), onWarning: writeWarning });
        console.log(output);
      } catch (error) {
        handleCommandError(error);
      }
    });
}

export const specDomain: Domain = {
  name: "spec",
  description: "Manage spec workflow",
  register: (program: Command, invocation: CliInvocation) => {
    const specCmd = program
      .command(SPEC_DOMAIN_CLI.COMMAND)
      .description("Manage spec workflow");

    registerSpecCommands(specCmd, invocation);
  },
};
