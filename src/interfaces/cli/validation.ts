import type { Command } from "commander";
import { existsSync, realpathSync } from "node:fs";
import { relative, resolve } from "node:path";

import {
  allCommand,
  circularCommand,
  formattingCommand,
  knipCommand,
  lintCommand,
  literalCommand,
  markdownCommand,
  typescriptCommand,
} from "@/commands/validation";
import type { Domain } from "@/domains/types";
import type { LiteralProblemKind } from "@/domains/validation/literal-problem-kind";
import type { CliInvocation, CliIo } from "@/interfaces/cli/product-context";
import { SPX_PROGRAM_NAME } from "@/interfaces/cli/program";
import {
  allValidationCliOptions,
  literalValidationCliOptions,
  validationCliDefinition,
  validationLiteralProblemKinds,
  type ValidationSubcommandDefinition,
} from "@/interfaces/cli/validation-contract";
import { canonicalTargetPath, isPathContained, nearestExistingCanonicalPath } from "@/lib/file-system/pathContainment";
import { sanitizeCliArgument } from "@/lib/sanitize-cli-argument";
import { allowlistExisting } from "@/validation/literal/allowlist-existing";
import type { ValidationScope } from "@/validation/types";

/** Common options for all validation commands */
interface CommonOptions {
  scope?: ValidationScope;
  quiet?: boolean;
  json?: boolean;
}

/** Options for lint command */
interface LintOptions extends CommonOptions {
  fix?: boolean;
}

interface LiteralOptions extends CommonOptions {
  allowlistExisting?: boolean;
  kind?: string;
  filesWithProblems?: boolean;
  literals?: boolean;
  verbose?: boolean;
}

interface AllOptions extends CommonOptions {
  fix?: boolean;
  skipCircular?: boolean;
  skipLiteral?: boolean;
}

interface ValidationCliResult {
  readonly output: string;
  readonly exitCode: number;
}

export interface ValidationCliDependencies {
  readonly allCommand: typeof allCommand;
  readonly allowlistExisting: typeof allowlistExisting;
  readonly circularCommand: typeof circularCommand;
  readonly formattingCommand: typeof formattingCommand;
  readonly knipCommand: typeof knipCommand;
  readonly lintCommand: typeof lintCommand;
  readonly literalCommand: typeof literalCommand;
  readonly markdownCommand: typeof markdownCommand;
  readonly typescriptCommand: typeof typescriptCommand;
}

const defaultValidationCliDependencies: ValidationCliDependencies = {
  allCommand,
  allowlistExisting,
  circularCommand,
  formattingCommand,
  knipCommand,
  lintCommand,
  literalCommand,
  markdownCommand,
  typescriptCommand,
};

function emitValidationResult(result: ValidationCliResult, io: CliIo): never {
  if (result.output.length > 0) {
    io.writeStdout(`${result.output}\n`);
  }
  return io.exit(result.exitCode);
}

/**
 * Add common options to a command
 */
function addCommonOptions(cmd: Command): Command {
  const { pathOperands } = validationCliDefinition;
  return cmd
    .argument(pathOperands.optionalVariadic, pathOperands.description)
    .option("--scope <scope>", "Validation scope (full|production)", "full")
    .option("--quiet", "Suppress progress output")
    .option("--json", "Output results as JSON");
}

async function normalizeProductPathOperand(
  productDir: string,
  effectiveInvocationDir: string,
  operand: string,
): Promise<string | undefined> {
  const resolvedProductDir = await canonicalPathThroughExistingAncestor(resolve(productDir));
  const resolvedInvocationDir = await canonicalPathThroughExistingAncestor(resolve(effectiveInvocationDir));
  const absoluteOperand = await canonicalPathThroughExistingAncestor(resolve(resolvedInvocationDir, operand));
  if (!isPathContained(resolvedProductDir, absoluteOperand)) {
    return undefined;
  }
  const relativeOperand = relative(resolvedProductDir, absoluteOperand);
  return relativeOperand.length > 0 ? relativeOperand.replaceAll("\\", "/") : ".";
}

async function canonicalPathThroughExistingAncestor(path: string): Promise<string> {
  const nearest = await nearestExistingCanonicalPath(
    path,
    (candidate) => existsSync(candidate) ? realpathSync.native(candidate) : undefined,
  );
  return nearest === undefined ? path : canonicalTargetPath(nearest, path);
}

async function normalizePathOperands(
  productDir: string,
  effectiveInvocationDir: string,
  pathOperands: readonly string[],
): Promise<string[] | undefined> {
  if (pathOperands.length === 0) return undefined;
  const normalized: string[] = [];
  for (const operand of pathOperands) {
    const path = await normalizeProductPathOperand(productDir, effectiveInvocationDir, operand);
    if (path === undefined) return undefined;
    normalized.push(path);
  }
  return normalized;
}

async function resolveValidationPaths(invocation: CliInvocation, pathOperands: readonly string[]): Promise<{
  readonly productDir: string;
  readonly files: string[] | undefined;
}> {
  const context = invocation.resolveProductContext();
  const files = await normalizePathOperands(context.productDir, context.effectiveInvocationDir, pathOperands);
  if (pathOperands.length > 0 && files === undefined) {
    const { invalidPathOperand } = validationCliDefinition.diagnostics;
    let invalidOperand: string | undefined;
    for (const operand of pathOperands) {
      const path = await normalizeProductPathOperand(context.productDir, context.effectiveInvocationDir, operand);
      if (path === undefined) {
        invalidOperand = operand;
        break;
      }
    }
    invocation.io.writeStderr(
      `spx ${validationCliDefinition.domain.commandName}: ${invalidPathOperand.messageLabel}: `
        + `${sanitizeCliArgument(invalidOperand)} (${invalidPathOperand.reason})\n`,
    );
    invocation.io.exit(invalidPathOperand.exitCode);
  }
  return {
    productDir: context.productDir,
    files,
  };
}

function addValidationSubcommand(
  validationCmd: Command,
  definition: ValidationSubcommandDefinition,
): Command {
  let subcommand = validationCmd
    .command(definition.commandName)
    .description(definition.description);

  if (definition.alias !== undefined) {
    subcommand = subcommand.alias(definition.alias);
  }

  return subcommand;
}

/**
 * Register validation domain commands
 */
function registerValidationCommands(
  validationCmd: Command,
  invocation: CliInvocation,
  deps: ValidationCliDependencies,
): void {
  const { subcommands } = validationCliDefinition;

  // typescript command
  const tsCmd = addValidationSubcommand(validationCmd, subcommands.typescript)
    .action(async (pathOperands: string[], options: CommonOptions) => {
      const paths = await resolveValidationPaths(invocation, pathOperands);
      const result = await deps.typescriptCommand({
        cwd: paths.productDir,
        scope: options.scope,
        files: paths.files,
        quiet: options.quiet,
        json: options.json,
      });
      emitValidationResult(result, invocation.io);
    });
  addCommonOptions(tsCmd);

  // lint command
  const lintCmd = addValidationSubcommand(validationCmd, subcommands.lint)
    .option("--fix", "Auto-fix issues")
    .action(async (pathOperands: string[], options: LintOptions) => {
      const paths = await resolveValidationPaths(invocation, pathOperands);
      const result = await deps.lintCommand({
        cwd: paths.productDir,
        scope: options.scope,
        files: paths.files,
        fix: options.fix,
        quiet: options.quiet,
        json: options.json,
      });
      emitValidationResult(result, invocation.io);
    });
  addCommonOptions(lintCmd);

  // circular command
  const circularCmd = addValidationSubcommand(validationCmd, subcommands.circular)
    .action(async (pathOperands: string[], options: CommonOptions) => {
      const paths = await resolveValidationPaths(invocation, pathOperands);
      const result = await deps.circularCommand({
        cwd: paths.productDir,
        scope: options.scope,
        files: paths.files,
        quiet: options.quiet,
        json: options.json,
      });
      emitValidationResult(result, invocation.io);
    });
  addCommonOptions(circularCmd);

  // knip command
  const knipCmd = addValidationSubcommand(validationCmd, subcommands.knip)
    .action(async (pathOperands: string[], options: CommonOptions) => {
      const paths = await resolveValidationPaths(invocation, pathOperands);
      const result = await deps.knipCommand({
        cwd: paths.productDir,
        scope: options.scope,
        files: paths.files,
        quiet: options.quiet,
        json: options.json,
      });
      emitValidationResult(result, invocation.io);
    });
  addCommonOptions(knipCmd);

  // literal command (cross-file literal-reuse detector)
  const literalCmd = addValidationSubcommand(validationCmd, subcommands.literal)
    .option(
      literalValidationCliOptions.allowlistExisting.flag,
      literalValidationCliOptions.allowlistExisting.description,
    )
    .option(literalValidationCliOptions.kind.flag, literalValidationCliOptions.kind.description)
    .option(
      literalValidationCliOptions.filesWithProblems.flag,
      literalValidationCliOptions.filesWithProblems.description,
    )
    .option(literalValidationCliOptions.literals.flag, literalValidationCliOptions.literals.description)
    .option(literalValidationCliOptions.verbose.flag, literalValidationCliOptions.verbose.description)
    .addHelpText(
      "after",
      "\nEnabled for TypeScript projects by default. Set validation.literal.enabled=false\n"
        + "in spx.config.* to skip during migration.",
    )
    .action(async (pathOperands: string[], options: LiteralOptions) => {
      const paths = await resolveValidationPaths(invocation, pathOperands);
      if (options.allowlistExisting) {
        const result = await deps.allowlistExisting({ productDir: paths.productDir });
        emitValidationResult(result, invocation.io);
      }
      let kind: LiteralProblemKind | undefined;
      if (options.kind !== undefined) {
        kind = parseLiteralProblemKind(options.kind);
        if (kind === undefined) {
          const { unknownLiteralProblemKind } = validationCliDefinition.diagnostics;
          invocation.io.writeStderr(
            `spx validation literal: ${unknownLiteralProblemKind.messageLabel}: ${sanitizeCliArgument(options.kind)}\n`,
          );
          invocation.io.exit(unknownLiteralProblemKind.exitCode);
        }
      }
      const result = await deps.literalCommand({
        cwd: paths.productDir,
        scope: options.scope,
        files: paths.files,
        kind,
        filesWithProblems: options.filesWithProblems,
        literals: options.literals,
        verbose: options.verbose,
        quiet: options.quiet,
        json: options.json,
      });
      emitValidationResult(result, invocation.io);
    });
  addCommonOptions(literalCmd);

  // markdown command
  const markdownCmd = addValidationSubcommand(validationCmd, subcommands.markdown)
    .addHelpText(
      "after",
      "\nValidates spx/ and docs/ by default. For nodes listed in spx/EXCLUDE,\n"
        + "only direct markdown files in that node directory are skipped;\n"
        + "child-node markdown remains in scope.",
    )
    .action(async (pathOperands: string[], options: CommonOptions) => {
      const paths = await resolveValidationPaths(invocation, pathOperands);
      const result = await deps.markdownCommand({
        cwd: paths.productDir,
        files: paths.files,
        quiet: options.quiet,
      });
      emitValidationResult(result, invocation.io);
    });
  addCommonOptions(markdownCmd);

  // format command
  const formatCmd = addValidationSubcommand(validationCmd, subcommands.format)
    .action(async (pathOperands: string[], options: CommonOptions) => {
      const paths = await resolveValidationPaths(invocation, pathOperands);
      const result = await deps.formattingCommand({
        cwd: paths.productDir,
        files: paths.files,
        quiet: options.quiet,
      });
      emitValidationResult(result, invocation.io);
    });
  addCommonOptions(formatCmd);

  // all command
  const allCmd = addValidationSubcommand(validationCmd, subcommands.all)
    .option("--fix", "Auto-fix ESLint issues")
    .option(allValidationCliOptions.skipCircular.flag, allValidationCliOptions.skipCircular.description)
    .option(allValidationCliOptions.skipLiteral.flag, allValidationCliOptions.skipLiteral.description)
    .action(async (pathOperands: string[], options: AllOptions) => {
      const paths = await resolveValidationPaths(invocation, pathOperands);
      const result = await deps.allCommand({
        cwd: paths.productDir,
        scope: options.scope,
        files: paths.files,
        fix: options.fix,
        skipCircular: options.skipCircular,
        skipLiteral: options.skipLiteral,
        quiet: options.quiet,
        json: options.json,
      }, {
        writeOutput: (output) => invocation.io.writeStdout(`${output}\n`),
      });
      return invocation.io.exit(result.exitCode);
    });
  addCommonOptions(allCmd);
}

function parseLiteralProblemKind(value: string): LiteralProblemKind | undefined {
  return validationLiteralProblemKinds.find((problemKind) => problemKind === value);
}

function handleUnknownSubcommand(operands: readonly string[], io: CliIo): never {
  const [first] = operands;
  const sanitized = sanitizeCliArgument(first);
  const { domain, diagnostics } = validationCliDefinition;
  const { unknownSubcommand } = diagnostics;
  io.writeStderr(
    `${SPX_PROGRAM_NAME} ${domain.commandName}: ${unknownSubcommand.messageLabel}: ${sanitized}\n`,
  );
  return io.exit(unknownSubcommand.exitCode);
}

export function createValidationDomain(
  overrides: Partial<ValidationCliDependencies> = {},
): Domain {
  const deps: ValidationCliDependencies = { ...defaultValidationCliDependencies, ...overrides };
  return {
    name: validationCliDefinition.domain.commandName,
    description: validationCliDefinition.domain.description,
    register: (program: Command, invocation: CliInvocation) => {
      const { domain } = validationCliDefinition;
      const validationCmd = program
        .command(domain.commandName)
        .alias(domain.alias)
        .description(domain.description);

      validationCmd.on("command:*", (operands: readonly string[]) => {
        handleUnknownSubcommand(operands, invocation.io);
      });

      registerValidationCommands(validationCmd, invocation, deps);
    },
  };
}

export const validationDomain: Domain = createValidationDomain();
