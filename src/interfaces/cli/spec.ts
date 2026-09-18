import type { Command } from "commander";

import { renderSpecContextJson, renderSpecContextText, resolveContextManifest } from "@/commands/spec/context";
import { type ContextShowOptions, resolveContextShow } from "@/commands/spec/context-show";
import { nextCommand } from "@/commands/spec/next";
import { createNodeOutcomeResolver } from "@/commands/spec/node-outcome-resolver";
import { OUTPUT_FORMAT, type OutputFormat, statusCommand } from "@/commands/spec/status";
import { inferInvokingCodingAgent } from "@/interfaces/cli/coding-agent";
import type { Domain } from "@/interfaces/cli/domain";
import type { CliInvocation, CliIo } from "@/interfaces/cli/product-context";
import { SPEC_CONTEXT_TARGET_DIAGNOSTIC_PREFIX } from "@/interfaces/cli/spec-context-contract";
import { renderSpecContextEntries, type SpecContextTargetFailure } from "@/lib/spec-tree";
import {
  authoredText,
  externalToken,
  externalValue,
  joinTerminalText,
  jsonDocument,
  terminal,
  type TerminalText,
} from "@/lib/terminal-text/terminal-text";
import { testingRegistry } from "@/test/registry";

export const SPEC_DOMAIN_CLI = {
  COMMAND: "spec",
  STATUS_COMMAND: "status",
  NEXT_COMMAND: "next",
  CONTEXT_COMMAND: "context",
  CONTEXT_SHOW_COMMAND: "show",
  CONTEXT_LIST_COMMAND: "list",
  RETIRED_APPLY_COMMAND: "apply",
  JSON_OPTION: "--json",
  METHODOLOGY_OPTION: "--methodology",
  LOADED_PRODUCT_OPTION: "--loaded-product",
  LOADED_TARGET_OPTION: "--loaded-target <path>",
  LOADED_METHODOLOGY_OPTION: "--loaded-methodology",
  CODING_AGENT_OPTION: "--coding-agent",
  CODING_AGENT_OPTION_DEFINITION: "--coding-agent <name>",
  FORMAT_OPTION_FLAG: "--format",
  FORMAT_OPTION_DEFINITION: "--format <format>",
  UPDATE_OPTION: "--update",
} as const;

export const SPEC_STATUS_FORMAT_MESSAGE = {
  ERROR_PREFIX: "Error",
  INVALID_PREFIX: "Invalid format",
  VALID_OPTIONS_PREFIX: "Must be one of",
} as const;

export const SPEC_STATUS_OUTPUT_FORMATS: readonly OutputFormat[] = [
  OUTPUT_FORMAT.TEXT,
  OUTPUT_FORMAT.JSON,
  OUTPUT_FORMAT.MARKDOWN,
  OUTPUT_FORMAT.TABLE,
];

const UNPRINTABLE_ERROR_MESSAGE = "unprintable error";

function writeOutput(io: CliIo, output: TerminalText): void {
  io.writeStdout(terminal`${output}\n`);
}

function writeInvocationWarning(io: CliIo, warning: string | undefined): void {
  if (warning !== undefined) {
    io.writeStderr(terminal`${externalValue(warning)}\n`);
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
  io.writeStderr(terminal`${authoredText(SPEC_STATUS_FORMAT_MESSAGE.ERROR_PREFIX)}: ${externalValue(message)}\n`);
  return io.exit(1);
}

/** Formats a typed target-resolution failure for safe terminal presentation. */
export function formatSpecContextTargetFailure(failure: SpecContextTargetFailure): TerminalText {
  const prefix = SPEC_CONTEXT_TARGET_DIAGNOSTIC_PREFIX[failure.kind];
  const candidates = failure.candidates.length === 0
    ? authoredText("")
    : terminal`. Candidates: ${
      joinTerminalText(authoredText(", "), failure.candidates.map((path) => externalValue(path)))
    }`;
  return terminal`${authoredText(prefix)}: ${externalToken(failure.input)}${candidates}`;
}

function writeContextFailure(io: CliIo, failure: SpecContextTargetFailure): void {
  io.writeStderr(terminal`${formatSpecContextTargetFailure(failure)}\n`);
  io.setExitCode(1);
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

  const contextCmd = specCmd
    .command(SPEC_DOMAIN_CLI.CONTEXT_COMMAND)
    .description("Discover and load deterministic spec-tree context");

  contextCmd
    .command(SPEC_DOMAIN_CLI.CONTEXT_LIST_COMMAND)
    .description("List the structural context manifest for accepted targets")
    .argument("<targets...>", "Product, node, spec, or decision paths")
    .option(SPEC_DOMAIN_CLI.JSON_OPTION, "Output as JSON")
    .action(async (targets: string[], options: { json?: boolean }) => {
      try {
        const result = await resolveContextManifest({
          targets,
          cwd: invocation.resolveEffectiveInvocationDir(),
          onWarning,
        });
        if (!result.ok) return writeContextFailure(invocation.io, result.failure);
        const output = options.json === true
          ? renderSpecContextJson(result.manifest)
          : renderSpecContextText(result.manifest);
        invocation.io.writeStdout(terminal`${output}\n`);
      } catch (error) {
        handleCommandError(invocation.io, error);
      }
    });

  contextCmd
    .command(SPEC_DOMAIN_CLI.CONTEXT_SHOW_COMMAND)
    .description("Show product discovery or the content selected for accepted targets")
    .argument("[targets...]", "Product, node, spec, or decision paths", [])
    .option(SPEC_DOMAIN_CLI.JSON_OPTION, "Output as JSON")
    .option(SPEC_DOMAIN_CLI.METHODOLOGY_OPTION, "Include the shipped methodology foundation")
    .option(
      SPEC_DOMAIN_CLI.LOADED_PRODUCT_OPTION,
      "Suppress the targetless product projection already loaded in this conversation window",
    )
    .option(
      SPEC_DOMAIN_CLI.LOADED_TARGET_OPTION,
      "Suppress a target projection already loaded in this conversation window",
      (path: string, paths: string[]) => [...paths, path],
      [],
    )
    .option(
      SPEC_DOMAIN_CLI.LOADED_METHODOLOGY_OPTION,
      "Declare the methodology foundation present in this conversation window",
    )
    .option(
      SPEC_DOMAIN_CLI.CODING_AGENT_OPTION_DEFINITION,
      "Coding agent whose shipped methodology tree the payload reads; defaults to the invoking agent",
    )
    .action(
      async (
        targets: string[],
        options: Partial<ContextShowOptions> & { json?: boolean; loadedTarget?: string[] },
      ) => {
        try {
          const result = await resolveContextShow({
            targets,
            cwd: invocation.resolveEffectiveInvocationDir(),
            methodology: options.methodology === true,
            loadedMethodology: options.loadedMethodology === true,
            loadedProduct: options.loadedProduct === true,
            loadedTargets: options.loadedTarget,
            codingAgent: options.codingAgent ?? inferInvokingCodingAgent(process.env),
            methodologyTreeRoot: invocation.methodologyTreeRoot,
            onWarning,
          });
          if (!result.ok) return writeContextFailure(invocation.io, result.failure);
          if (options.json === true) {
            invocation.io.writeStdout(terminal`${jsonDocument({ entries: result.entries }, 2)}\n`);
          } else invocation.io.writePassThrough(renderSpecContextEntries(result.entries));
        } catch (error) {
          handleCommandError(invocation.io, error);
        }
      },
    );

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
