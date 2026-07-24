import type { Command } from "commander";

import {
  type ContextOptions,
  renderSpecContextJson,
  renderSpecContextText,
  resolveContextManifest,
} from "@/commands/spec/context";
import { nextCommand } from "@/commands/spec/next";
import { createNodeOutcomeResolver } from "@/commands/spec/node-outcome-resolver";
import { OUTPUT_FORMAT, type OutputFormat, statusCommand } from "@/commands/spec/status";
import type { Domain } from "@/interfaces/cli/domain";
import type { CliInvocation, CliIo } from "@/interfaces/cli/product-context";
import { SPEC_CONTEXT_TARGET_DIAGNOSTIC_PREFIX } from "@/interfaces/cli/spec-context-contract";
import { sanitizeCliArgument } from "@/lib/sanitize-cli-argument";
import { SPEC_CONTEXT_TARGET_FAILURE_KIND, type SpecContextTargetFailure } from "@/lib/spec-tree";
import { testingRegistry } from "@/test/registry";

export const SPEC_DOMAIN_CLI = {
  COMMAND: "spec",
  STATUS_COMMAND: "status",
  NEXT_COMMAND: "next",
  CONTEXT_COMMAND: "context",
  CONTEXT_SHOW_COMMAND: "show",
  RETIRED_APPLY_COMMAND: "apply",
  JSON_OPTION: "--json",
  CONTENT_OPTION: "--content",
  UNDERSTAND_OPTION: "--understand",
  FORMAT_OPTION_FLAG: "--format",
  FORMAT_OPTION_DEFINITION: "--format <format>",
  UPDATE_OPTION: "--update",
} as const;

export const SPEC_CONTEXT_CONTENT_MESSAGE = {
  REQUIRES_JSON: `${SPEC_DOMAIN_CLI.CONTENT_OPTION} requires ${SPEC_DOMAIN_CLI.JSON_OPTION}`,
} as const;

export const SPEC_STATUS_FORMAT_MESSAGE = {
  ERROR_PREFIX: "Error",
  INVALID_PREFIX: "Invalid format",
  VALID_OPTIONS_PREFIX: "Must be one of",
} as const;

export const SPEC_CONTEXT_OUTPUT_FORMAT = {
  TEXT: "text",
  JSON: "json",
} as const;

export const SPEC_CONTEXT_OUTPUT_FORMAT_MESSAGE = {
  INVALID_PREFIX: "Invalid spec context output format",
  VALID_OPTIONS_PREFIX: "Must be one of",
} as const;

export type SpecContextOutputFormat = (typeof SPEC_CONTEXT_OUTPUT_FORMAT)[keyof typeof SPEC_CONTEXT_OUTPUT_FORMAT];

export const SPEC_STATUS_OUTPUT_FORMATS: readonly OutputFormat[] = [
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
  io.writeStderr(`${SPEC_STATUS_FORMAT_MESSAGE.ERROR_PREFIX}: ${message}\n`);
  return io.exit(1);
}

function quotedCliArgument(value: string): string {
  return JSON.stringify(sanitizeCliArgument(value));
}

/** Formats a typed target-resolution failure for safe terminal presentation. */
export function formatSpecContextTargetFailure(failure: SpecContextTargetFailure): string {
  const prefix = SPEC_CONTEXT_TARGET_DIAGNOSTIC_PREFIX[failure.kind];
  switch (failure.kind) {
    case SPEC_CONTEXT_TARGET_FAILURE_KIND.AMBIGUOUS_SEGMENT:
      return `${prefix} ${quotedCliArgument(failure.segment)} for input ${
        quotedCliArgument(failure.input)
      }. Candidates: ${failure.candidates.map(sanitizeCliArgument).join(", ")}`;
    case SPEC_CONTEXT_TARGET_FAILURE_KIND.ARTIFACT_PATH:
      return `${prefix}: ${sanitizeCliArgument(failure.input)}. Use spx/${sanitizeCliArgument(failure.ownerId)}`;
    case SPEC_CONTEXT_TARGET_FAILURE_KIND.ROOT_ARTIFACT_PATH:
      return `${prefix}: ${sanitizeCliArgument(failure.input)}`;
    case SPEC_CONTEXT_TARGET_FAILURE_KIND.UNKNOWN_SEGMENT:
      return `${prefix} ${quotedCliArgument(failure.segment)} for input ${quotedCliArgument(failure.input)}`;
  }
}

/** Routes a named context output format to its deterministic renderer. */
export async function contextOutputForFormat(
  format: SpecContextOutputFormat,
  options: ContextOptions,
): Promise<string> {
  if (!Object.values(SPEC_CONTEXT_OUTPUT_FORMAT).includes(format)) {
    throw new Error(
      `${SPEC_CONTEXT_OUTPUT_FORMAT_MESSAGE.INVALID_PREFIX} ${
        quotedCliArgument(format)
      }. ${SPEC_CONTEXT_OUTPUT_FORMAT_MESSAGE.VALID_OPTIONS_PREFIX}: ${
        Object.values(SPEC_CONTEXT_OUTPUT_FORMAT).join(", ")
      }`,
    );
  }
  const resolution = await resolveContextManifest(options);
  if (!resolution.ok) throw new Error(formatSpecContextTargetFailure(resolution.failure));
  return format === SPEC_CONTEXT_OUTPUT_FORMAT.JSON
    ? renderSpecContextJson(resolution.manifest)
    : renderSpecContextText(resolution.manifest);
}

function resolveStatusFormat(options: { json?: boolean; format?: string }): OutputFormat {
  if (options.json === true) {
    return "json";
  }

  if (options.format === undefined) {
    return "text";
  }

  if (SPEC_STATUS_OUTPUT_FORMATS.includes(options.format as OutputFormat)) {
    return options.format as OutputFormat;
  }

  throw new Error(
    `${SPEC_STATUS_FORMAT_MESSAGE.INVALID_PREFIX} "${options.format}". ${SPEC_STATUS_FORMAT_MESSAGE.VALID_OPTIONS_PREFIX}: ${
      SPEC_STATUS_OUTPUT_FORMATS.join(", ")
    }`,
  );
}

function registerSpecCommands(specCmd: Command, invocation: CliInvocation): void {
  const productDir = (): string => invocation.resolveProductContext().productDir;
  const onWarning = (warning: string | undefined): void => writeInvocationWarning(invocation.io, warning);

  specCmd
    .command(SPEC_DOMAIN_CLI.CONTEXT_COMMAND)
    .description("Deterministic context bundles for spec-tree nodes")
    .command(SPEC_DOMAIN_CLI.CONTEXT_SHOW_COMMAND)
    .description("Load one deduplicated context bundle for one or more spec-tree nodes")
    .argument("<targets...>", "Spec-tree node paths")
    .option(SPEC_DOMAIN_CLI.JSON_OPTION, "Output as JSON")
    .option(
      SPEC_DOMAIN_CLI.CONTENT_OPTION,
      `Include each read document's exact content, digest, and byte count (requires ${SPEC_DOMAIN_CLI.JSON_OPTION})`,
    )
    .option(
      SPEC_DOMAIN_CLI.UNDERSTAND_OPTION,
      "Include the foundation methodology payload from the installed methodology package",
    )
    .action(async (targets: string[], options: { json?: boolean; content?: boolean; understand?: boolean }) => {
      try {
        if (options.content === true && options.json !== true) {
          throw new Error(SPEC_CONTEXT_CONTENT_MESSAGE.REQUIRES_JSON);
        }
        const format = options.json === true
          ? SPEC_CONTEXT_OUTPUT_FORMAT.JSON
          : SPEC_CONTEXT_OUTPUT_FORMAT.TEXT;
        const output = await contextOutputForFormat(format, {
          targets,
          cwd: productDir(),
          content: options.content === true,
          understand: options.understand === true,
          onWarning,
        });
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
