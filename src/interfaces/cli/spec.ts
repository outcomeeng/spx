import type { Command } from "commander";

import { contextCommand, type ContextOptions, contextTextCommand } from "@/commands/spec/context";
import { nextCommand } from "@/commands/spec/next";
import { createNodeOutcomeResolver } from "@/commands/spec/node-outcome-resolver";
import { OUTPUT_FORMAT, type OutputFormat, statusCommand } from "@/commands/spec/status";
import type { Domain } from "@/domains/types";
import type { CliInvocation, CliIo } from "@/interfaces/cli/product-context";
import { testingRegistry } from "@/test/registry";

import { createRunnerDepsFor } from "./test-runner-deps";

export const SPEC_DOMAIN_CLI = {
  COMMAND: "spec",
  STATUS_COMMAND: "status",
  NEXT_COMMAND: "next",
  CONTEXT_COMMAND: "context",
  JSON_OPTION: "--json",
  FORMAT_OPTION_FLAG: "--format",
  FORMAT_OPTION_DEFINITION: "--format <format>",
  UPDATE_OPTION: "--update",
} as const;

export const SPEC_STATUS_FORMAT_MESSAGE = {
  INVALID_PREFIX: "Invalid format",
} as const;

export const SPEC_CONTEXT_OUTPUT_FORMAT = {
  TEXT: "text",
  JSON: "json",
} as const;

export type SpecContextOutputFormat = (typeof SPEC_CONTEXT_OUTPUT_FORMAT)[keyof typeof SPEC_CONTEXT_OUTPUT_FORMAT];

const VALID_STATUS_FORMATS: readonly OutputFormat[] = [
  OUTPUT_FORMAT.TEXT,
  OUTPUT_FORMAT.JSON,
  OUTPUT_FORMAT.MARKDOWN,
  OUTPUT_FORMAT.TABLE,
];

const UNPRINTABLE_ERROR_MESSAGE = "unprintable error";

function writeOutput(io: CliIo, output: string): void {
  io.writeStdout(`${output}\n`);
}

function writeInvocationWarning(io: CliIo, warning: string | undefined): void {
  if (warning !== undefined) {
    io.writeStderr(`${warning}\n`);
  }
}

function handleCommandError(io: CliIo, error: unknown): never {
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
  io.writeStderr(`Error: ${message}\n`);
  return io.exit(1);
}

/** Routes a named context output format to its deterministic renderer. */
export async function contextOutputForFormat(
  format: SpecContextOutputFormat,
  options: ContextOptions,
): Promise<string> {
  return format === SPEC_CONTEXT_OUTPUT_FORMAT.JSON
    ? contextCommand(options)
    : contextTextCommand(options);
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
  const onWarning = (warning: string | undefined): void => writeInvocationWarning(invocation.io, warning);

  specCmd
    .command(SPEC_DOMAIN_CLI.CONTEXT_COMMAND)
    .description("Load deterministic context for a spec-tree node")
    .argument("<target>", "Spec-tree node path")
    .option(SPEC_DOMAIN_CLI.JSON_OPTION, "Output as JSON")
    .action(async (target: string, options: { json?: boolean }) => {
      try {
        const format = options.json === true
          ? SPEC_CONTEXT_OUTPUT_FORMAT.JSON
          : SPEC_CONTEXT_OUTPUT_FORMAT.TEXT;
        const output = await contextOutputForFormat(format, { target, cwd: productDir(), onWarning });
        writeOutput(invocation.io, output);
      } catch (error) {
        handleCommandError(invocation.io, error);
      }
    });

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
            onWarning,
            update: true,
            resolveOutcomeFor: (productDir) =>
              createNodeOutcomeResolver({
                productDir,
                registry: testingRegistry,
                runnerDepsFor: createRunnerDepsFor(productDir, process.stderr),
              }),
          })
          : await statusCommand({ cwd: productDir(), format, onWarning });
        writeOutput(invocation.io, output);
      } catch (error) {
        handleCommandError(invocation.io, error);
      }
    });

  specCmd
    .command(SPEC_DOMAIN_CLI.NEXT_COMMAND)
    .description("Find next spec-tree node to work on")
    .action(async () => {
      try {
        const output = await nextCommand({ cwd: productDir(), onWarning });
        writeOutput(invocation.io, output);
      } catch (error) {
        handleCommandError(invocation.io, error);
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
