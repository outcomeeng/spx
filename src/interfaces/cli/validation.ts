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
import {
  type AllCommandOptions,
  type CircularCommandOptions,
  type CommonValidationOptions,
  type FormattingCommandOptions,
  type KnipCommandOptions,
  type LintCommandOptions,
  type MarkdownCommandOptions,
  type TypeScriptCommandOptions,
  VALIDATION_OUTPUT_TARGET,
  type ValidationCommandResult,
  type ValidationOutputTarget,
} from "@/commands/validation/types";
import type { Domain } from "@/domains/types";
import type { LiteralProblemKind } from "@/domains/validation/literal-problem-kind";
import type { CliInvocation, CliIo } from "@/interfaces/cli/product-context";
import { SPX_PROGRAM_NAME } from "@/interfaces/cli/program";
import {
  isValidationLiteralProblemKind,
  literalValidationCliOptions,
  validationAllBuiltInCliOptions,
  validationCliDefinition,
  validationCommonCliOptions,
  type ValidationSubcommandDefinition,
} from "@/interfaces/cli/validation-contract";
import { canonicalTargetPath, isPathContained, nearestExistingCanonicalPath } from "@/lib/file-system/pathContainment";
import { sanitizeCliArgument } from "@/lib/sanitize-cli-argument";
import { VALIDATION_STAGE_PARTICIPATION, type ValidationStage } from "@/validation/languages/types";
import { allowlistExisting } from "@/validation/literal/allowlist-existing";
import { validationPipelineStages } from "@/validation/registry";
import {
  discardValidationSubprocessOutputStreams,
  type ValidationSubprocessOutputStreams,
} from "@/validation/steps/subprocess-output";
import type { ValidationScope } from "@/validation/types";

export interface ValidationAllOverrideCliOption {
  readonly stageName: string;
  readonly flag: `--${string}`;
  readonly description: string;
  readonly reason: string;
  readonly optionPropertyName: string;
}

const LONG_OPTION_PREFIX = "--";
const OPTION_PROPERTY_WORD_SEPARATOR_PATTERN = /-([a-z0-9])/g;
const VALIDATION_ALL_OVERRIDE_FLAG_PATTERN = /^--(?!no-)[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;

const validationAllReservedOverrideFlags: ReadonlySet<string> = new Set([
  ...Object.values(validationCommonCliOptions).map((option) => option.flag),
  ...Object.values(validationAllBuiltInCliOptions).map((option) => option.flag),
  validationCliDefinition.commanderHelpOperands.longFlag,
]);

export function validationOptionPropertyName(flag: `--${string}`): string {
  return flag.slice(LONG_OPTION_PREFIX.length)
    .replace(OPTION_PROPERTY_WORD_SEPARATOR_PATTERN, (_match, character: string) => character.toUpperCase());
}

export function deriveValidationAllOverrideCliOptions(
  stages: readonly ValidationStage[],
): readonly ValidationAllOverrideCliOption[] {
  const optionPropertyNames = new Set<string>();
  return stages.flatMap((stage) => {
    validateStageParticipationMetadata(stage);
    const override = stage.participation.override;
    if (override === undefined) return [];
    const optionPropertyName = validationOptionPropertyName(override.flag);
    if (optionPropertyNames.has(optionPropertyName)) {
      throw new Error(`duplicate validation all override option property: ${optionPropertyName}`);
    }
    optionPropertyNames.add(optionPropertyName);
    return [{
      stageName: stage.name,
      flag: override.flag,
      description: override.description,
      reason: override.reason,
      optionPropertyName,
    }];
  });
}

function validateStageParticipationMetadata(stage: ValidationStage): void {
  if (
    stage.participation.default === VALIDATION_STAGE_PARTICIPATION.SKIP
    && (stage.participation.defaultSkipReason === undefined || stage.participation.defaultSkipReason.length === 0)
  ) {
    throw new Error(`validation stage ${stage.name} default skip participation requires a reason`);
  }
  const override = stage.participation.override;
  if (override === undefined) return;
  if (!VALIDATION_ALL_OVERRIDE_FLAG_PATTERN.test(override.flag)) {
    throw new Error(`validation stage ${stage.name} override flag must be a bare long kebab-case boolean flag`);
  }
  if (validationAllReservedOverrideFlags.has(override.flag)) {
    throw new Error(`validation stage ${stage.name} override flag collides with a validation all built-in option`);
  }
  if (override.description.length === 0) {
    throw new Error(`validation stage ${stage.name} override flag requires a description`);
  }
  if (override.reason.length === 0) {
    throw new Error(`validation stage ${stage.name} override flag requires a skip reason`);
  }
}

export const validationAllOverrideCliOptions: readonly ValidationAllOverrideCliOption[] =
  deriveValidationAllOverrideCliOptions(validationPipelineStages);

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
  readonly [key: string]: boolean | string | undefined;
}

export interface ValidationDomainOptions {
  readonly validationStages?: readonly ValidationStage[];
  readonly commandHandlers?: Partial<ValidationCommandHandlers>;
  readonly allowlistExisting?: typeof allowlistExisting;
}

interface ValidationCliResult {
  readonly output: string;
  readonly exitCode: number;
  readonly outputTarget?: ValidationOutputTarget;
  readonly terminalOutput?: string;
}

interface LiteralCommandHandlerOptions extends CommonValidationOptions {
  readonly kind?: LiteralProblemKind;
  readonly filesWithProblems?: boolean;
  readonly literals?: boolean;
  readonly verbose?: boolean;
}

export interface ValidationCommandHandlers {
  readonly typescript: (options: TypeScriptCommandOptions) => Promise<ValidationCommandResult>;
  readonly lint: (options: LintCommandOptions) => Promise<ValidationCommandResult>;
  readonly circular: (options: CircularCommandOptions) => Promise<ValidationCommandResult>;
  readonly knip: (options: KnipCommandOptions) => Promise<ValidationCommandResult>;
  readonly literal: (options: LiteralCommandHandlerOptions) => Promise<ValidationCommandResult>;
  readonly markdown: (options: MarkdownCommandOptions) => Promise<ValidationCommandResult>;
  readonly format: (options: FormattingCommandOptions) => Promise<ValidationCommandResult>;
  readonly all: (options: AllCommandOptions) => Promise<ValidationCommandResult>;
}

const defaultValidationCommandHandlers: ValidationCommandHandlers = {
  typescript: typescriptCommand,
  lint: lintCommand,
  circular: circularCommand,
  knip: knipCommand,
  literal: literalCommand,
  markdown: markdownCommand,
  format: formattingCommand,
  all: allCommand,
};

function emitValidationResult(result: ValidationCliResult, io: CliIo): never {
  const output = result.terminalOutput ?? result.output;
  if (output.length > 0) {
    const outputTarget = result.outputTarget
      ?? (result.exitCode === 0 ? VALIDATION_OUTPUT_TARGET.STDOUT : VALIDATION_OUTPUT_TARGET.STDERR);
    const writeOutput = outputTarget === VALIDATION_OUTPUT_TARGET.STDOUT
      ? io.writeStdout
      : io.writeStderr;
    writeOutput(`${output}\n`);
  }
  return io.exit(result.exitCode);
}

/**
 * Add common options to a command
 */
function addCommonOptions(cmd: Command, definition: ValidationSubcommandDefinition): Command {
  const { pathOperands } = validationCliDefinition;
  let configured = cmd
    .argument(pathOperands.optionalVariadic, pathOperands.description)
    .option(validationCommonCliOptions.quiet.flag, "Suppress progress output");
  if (definition.options.scope) {
    configured = configured.option(
      `${validationCommonCliOptions.scope.flag} <scope>`,
      "Validation scope (full|production)",
      "full",
    );
  }
  if (definition.options.json) {
    configured = configured.option(validationCommonCliOptions.json.flag, "Output results as JSON");
  }
  return configured;
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

function selectedValidationAllOverrides(
  options: AllOptions,
  allOverrideCliOptions: readonly ValidationAllOverrideCliOption[] = validationAllOverrideCliOptions,
): readonly `--${string}`[] {
  return allOverrideCliOptions
    .filter((option) => options[option.optionPropertyName] === true)
    .map((option) => option.flag);
}

/**
 * Register validation domain commands
 */
function registerValidationCommands(
  validationCmd: Command,
  invocation: CliInvocation,
  options: ValidationDomainOptions = {},
): void {
  const { subcommands } = validationCliDefinition;
  const commandHandlers: ValidationCommandHandlers = {
    ...defaultValidationCommandHandlers,
    ...options.commandHandlers,
  };
  const runAllowlistExisting = options.allowlistExisting ?? allowlistExisting;
  const validationStages = options.validationStages ?? validationPipelineStages;
  const allOverrideCliOptions = deriveValidationAllOverrideCliOptions(
    validationStages,
  );

  // typescript command
  const tsCmd = addValidationSubcommand(validationCmd, subcommands.typescript)
    .action(async (pathOperands: string[], options: CommonOptions) => {
      const paths = await resolveValidationPaths(invocation, pathOperands);
      const result = await commandHandlers.typescript({
        cwd: paths.productDir,
        scope: options.scope,
        files: paths.files,
        quiet: options.quiet,
      });
      emitValidationResult(result, invocation.io);
    });
  addCommonOptions(tsCmd, subcommands.typescript);

  // lint command
  const lintCmd = addValidationSubcommand(validationCmd, subcommands.lint)
    .option("--fix", "Auto-fix issues")
    .action(async (pathOperands: string[], options: LintOptions) => {
      const paths = await resolveValidationPaths(invocation, pathOperands);
      const result = await commandHandlers.lint({
        cwd: paths.productDir,
        scope: options.scope,
        files: paths.files,
        fix: options.fix,
        quiet: options.quiet,
      });
      emitValidationResult(result, invocation.io);
    });
  addCommonOptions(lintCmd, subcommands.lint);

  // circular command
  const circularCmd = addValidationSubcommand(validationCmd, subcommands.circular)
    .action(async (pathOperands: string[], options: CommonOptions) => {
      const paths = await resolveValidationPaths(invocation, pathOperands);
      const result = await commandHandlers.circular({
        cwd: paths.productDir,
        scope: options.scope,
        files: paths.files,
        quiet: options.quiet,
      });
      emitValidationResult(result, invocation.io);
    });
  addCommonOptions(circularCmd, subcommands.circular);

  // knip command
  const knipCmd = addValidationSubcommand(validationCmd, subcommands.knip)
    .action(async (pathOperands: string[], options: CommonOptions) => {
      const paths = await resolveValidationPaths(invocation, pathOperands);
      const result = await commandHandlers.knip({
        cwd: paths.productDir,
        scope: options.scope,
        files: paths.files,
        quiet: options.quiet,
      });
      emitValidationResult(result, invocation.io);
    });
  addCommonOptions(knipCmd, subcommands.knip);

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
        const result = await runAllowlistExisting({ productDir: paths.productDir });
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
      const result = await commandHandlers.literal({
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
  addCommonOptions(literalCmd, subcommands.literal);

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
      const result = await commandHandlers.markdown({
        cwd: paths.productDir,
        files: paths.files,
        quiet: options.quiet,
      });
      emitValidationResult(result, invocation.io);
    });
  addCommonOptions(markdownCmd, subcommands.markdown);

  // format command
  const formatCmd = addValidationSubcommand(validationCmd, subcommands.format)
    .action(async (pathOperands: string[], options: CommonOptions) => {
      const paths = await resolveValidationPaths(invocation, pathOperands);
      const result = await commandHandlers.format({
        cwd: paths.productDir,
        files: paths.files,
        quiet: options.quiet,
        json: options.json,
      });
      emitValidationResult(result, invocation.io);
    });
  addCommonOptions(formatCmd, subcommands.format);

  // all command
  let allCmd = addValidationSubcommand(validationCmd, subcommands.all)
    .option(validationAllBuiltInCliOptions.fix.flag, "Auto-fix ESLint issues");
  for (const option of allOverrideCliOptions) {
    allCmd = allCmd.option(option.flag, option.description);
  }
  allCmd = allCmd.action(async (pathOperands: string[], options: AllOptions) => {
    const paths = await resolveValidationPaths(invocation, pathOperands);
    const result = await commandHandlers.all({
      cwd: paths.productDir,
      scope: options.scope,
      files: paths.files,
      fix: options.fix,
      validationStages,
      participationOverrides: selectedValidationAllOverrides(options, allOverrideCliOptions),
      quiet: options.quiet,
      json: options.json,
      onStageComplete: ({ output }) => invocation.io.writeStdout(`${output}\n`),
      outputStreams: validationSubprocessOutputStreams(invocation.io, options.json),
    });
    emitValidationResult(result, invocation.io);
  });
  addCommonOptions(allCmd, subcommands.all);
}

function validationSubprocessOutputStreams(
  io: CliIo,
  json?: boolean,
): ValidationSubprocessOutputStreams | undefined {
  if (json === true) return discardValidationSubprocessOutputStreams;
  return {
    stdout: {
      write: (chunk) => {
        io.writeStdout(Buffer.from(chunk).toString());
        return true;
      },
    },
    stderr: {
      write: (chunk) => {
        io.writeStderr(Buffer.from(chunk).toString());
        return true;
      },
    },
  };
}

function parseLiteralProblemKind(value: string): LiteralProblemKind | undefined {
  if (isValidationLiteralProblemKind(value)) {
    return value;
  }
  return undefined;
}

function handleUnknownSubcommand(operands: readonly string[], io: CliIo): never {
  const [first] = operands;
  const sanitized = sanitizeCliArgument(first);
  const { domain, diagnostics } = validationCliDefinition;
  const { unknownSubcommand } = diagnostics;
  io.writeStderr(`${SPX_PROGRAM_NAME} ${domain.commandName}: ${unknownSubcommand.messageLabel}: ${sanitized}\n`);
  return io.exit(unknownSubcommand.exitCode);
}

export function createValidationDomain(options: ValidationDomainOptions = {}): Domain {
  return {
    name: validationCliDefinition.domain.commandName,
    description: validationCliDefinition.domain.description,
    register: (program: Command, invocation: CliInvocation) => {
      const { domain } = validationCliDefinition;
      const validationCmd = program
        .command(domain.commandName)
        .alias(domain.alias)
        .description(domain.description)
        .addHelpCommand(false);

      validationCmd.on("command:*", (operands: readonly string[]) => {
        handleUnknownSubcommand(operands, invocation.io);
      });

      registerValidationCommands(validationCmd, invocation, options);
    },
  };
}

export const validationDomain: Domain = createValidationDomain();
