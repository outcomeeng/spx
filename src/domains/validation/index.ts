/**
 * Validation domain - Run code validation tools
 *
 * Provides CLI commands for running validation tools (TypeScript, ESLint, etc.)
 * as a globally-installed tool across TypeScript projects.
 */
import type { Command } from "commander";

import { allowlistExisting } from "@/validation/literal/allowlist-existing.js";
import {
  allCommand,
  circularCommand,
  knipCommand,
  lintCommand,
  literalCommand,
  markdownCommand,
  typescriptCommand,
} from "../../commands/validation";
import { sanitizeCliArgument } from "../../lib/sanitize-cli-argument";
import type { Domain } from "../types";

/** Validation scope options */
type ValidationScope = "full" | "production";

interface ValidationDomainCommandDefinition {
  readonly commandName: string;
  readonly alias: string;
  readonly description: string;
}

interface ValidationSubcommandDefinition {
  readonly commandName: string;
  readonly alias?: string;
  readonly description: string;
}

interface ValidationCliDefinition {
  readonly domain: ValidationDomainCommandDefinition;
  readonly subcommands: {
    readonly typescript: ValidationSubcommandDefinition;
    readonly lint: ValidationSubcommandDefinition;
    readonly circular: ValidationSubcommandDefinition;
    readonly knip: ValidationSubcommandDefinition;
    readonly literal: ValidationSubcommandDefinition;
    readonly markdown: ValidationSubcommandDefinition;
    readonly all: ValidationSubcommandDefinition;
  };
  readonly commanderHelpOperands: {
    readonly subcommand: string;
    readonly longFlag: string;
    readonly shortFlag: string;
  };
  readonly diagnostics: {
    readonly unknownSubcommand: {
      readonly messageLabel: string;
      readonly exitCode: number;
    };
  };
}

export const validationCliDefinition: ValidationCliDefinition = {
  domain: {
    commandName: "validation",
    alias: "v",
    description: "Run code validation tools",
  },
  subcommands: {
    typescript: {
      commandName: "typescript",
      alias: "ts",
      description: "Run TypeScript type checking",
    },
    lint: {
      commandName: "lint",
      description: "Run ESLint",
    },
    circular: {
      commandName: "circular",
      description: "Check for circular dependencies",
    },
    knip: {
      commandName: "knip",
      description: "Detect unused code",
    },
    literal: {
      commandName: "literal",
      description: "Detect cross-file literal reuse between source and tests",
    },
    markdown: {
      commandName: "markdown",
      alias: "md",
      description: "Validate markdown link integrity and structure",
    },
    all: {
      commandName: "all",
      description: "Run all validations",
    },
  },
  commanderHelpOperands: {
    subcommand: "help",
    longFlag: "--help",
    shortFlag: "-h",
  },
  diagnostics: {
    unknownSubcommand: {
      messageLabel: "unknown subcommand",
      exitCode: 1,
    },
  },
} as const;

const validationSubcommandOperands = Object.values(validationCliDefinition.subcommands).flatMap(
  (subcommand) => {
    const operands = [subcommand.commandName];
    if (subcommand.alias !== undefined) operands.push(subcommand.alias);
    return operands;
  },
);

export const validationKnownOperands: ReadonlySet<string> = new Set([
  ...validationSubcommandOperands,
  ...Object.values(validationCliDefinition.commanderHelpOperands),
]);
export const validationOptionPrefix = validationCliDefinition.commanderHelpOperands.longFlag.slice(0, 1);

/** Common options for all validation commands */
interface CommonOptions {
  scope?: ValidationScope;
  files?: string[];
  quiet?: boolean;
  json?: boolean;
}

/** Options for lint command */
interface LintOptions extends CommonOptions {
  fix?: boolean;
}

/**
 * Add common options to a command
 */
function addCommonOptions(cmd: Command): Command {
  return cmd
    .option("--scope <scope>", "Validation scope (full|production)", "full")
    .option("--files <paths...>", "Specific files/directories to validate")
    .option("--quiet", "Suppress progress output")
    .option("--json", "Output results as JSON");
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
function registerValidationCommands(validationCmd: Command): void {
  const { subcommands } = validationCliDefinition;

  // typescript command
  const tsCmd = addValidationSubcommand(validationCmd, subcommands.typescript)
    .action(async (options: CommonOptions) => {
      const result = await typescriptCommand({
        cwd: process.cwd(),
        scope: options.scope,
        files: options.files,
        quiet: options.quiet,
        json: options.json,
      });
      if (result.output) console.log(result.output);
      process.exit(result.exitCode);
    });
  addCommonOptions(tsCmd);

  // lint command
  const lintCmd = addValidationSubcommand(validationCmd, subcommands.lint)
    .option("--fix", "Auto-fix issues")
    .action(async (options: LintOptions) => {
      const result = await lintCommand({
        cwd: process.cwd(),
        scope: options.scope,
        files: options.files,
        fix: options.fix,
        quiet: options.quiet,
        json: options.json,
      });
      if (result.output) console.log(result.output);
      process.exit(result.exitCode);
    });
  addCommonOptions(lintCmd);

  // circular command
  const circularCmd = addValidationSubcommand(validationCmd, subcommands.circular)
    .action(async (options: CommonOptions) => {
      const result = await circularCommand({
        cwd: process.cwd(),
        quiet: options.quiet,
        json: options.json,
      });
      if (result.output) console.log(result.output);
      process.exit(result.exitCode);
    });
  addCommonOptions(circularCmd);

  // knip command
  const knipCmd = addValidationSubcommand(validationCmd, subcommands.knip)
    .action(async (options: CommonOptions) => {
      const result = await knipCommand({
        cwd: process.cwd(),
        quiet: options.quiet,
        json: options.json,
      });
      if (result.output) console.log(result.output);
      process.exit(result.exitCode);
    });
  addCommonOptions(knipCmd);

  // literal command (cross-file literal-reuse detector)
  const literalCmd = addValidationSubcommand(validationCmd, subcommands.literal)
    .option(
      "--allowlist-existing",
      "Append every current finding's value to literal.allowlist.include and exit",
    )
    .addHelpText(
      "after",
      "\nEnabled for TypeScript projects by default. Set LITERAL_VALIDATION_ENABLED=0\n"
        + "to skip (useful when migrating a project with many existing violations).",
    )
    .action(async (options: CommonOptions & { allowlistExisting?: boolean }) => {
      if (options.allowlistExisting) {
        const result = await allowlistExisting({ projectRoot: process.cwd() });
        if (result.output) console.log(result.output);
        process.exit(result.exitCode);
      }
      const result = await literalCommand({
        cwd: process.cwd(),
        files: options.files,
        quiet: options.quiet,
        json: options.json,
      });
      if (result.output) console.log(result.output);
      process.exit(result.exitCode);
    });
  addCommonOptions(literalCmd);

  // markdown command
  const markdownCmd = addValidationSubcommand(validationCmd, subcommands.markdown)
    .addHelpText(
      "after",
      "\nValidates spx/ and docs/ by default. Nodes listed in spx/EXCLUDE are\n"
        + "skipped — use this for declared-state nodes whose [test] links point\n"
        + "to files that do not exist yet.",
    )
    .action(async (options: CommonOptions) => {
      const result = await markdownCommand({
        cwd: process.cwd(),
        files: options.files,
        quiet: options.quiet,
      });
      if (result.output) console.log(result.output);
      process.exit(result.exitCode);
    });
  addCommonOptions(markdownCmd);

  // all command
  const allCmd = addValidationSubcommand(validationCmd, subcommands.all)
    .option("--fix", "Auto-fix ESLint issues")
    .action(async (options: LintOptions) => {
      const result = await allCommand({
        cwd: process.cwd(),
        scope: options.scope,
        files: options.files,
        fix: options.fix,
        quiet: options.quiet,
        json: options.json,
      });
      if (result.output) console.log(result.output);
      process.exit(result.exitCode);
    });
  addCommonOptions(allCmd);
}

/**
 * Validation domain - Run code validation tools
 */
function handleUnknownSubcommand(operands: readonly string[]): never {
  const [first] = operands;
  const sanitized = sanitizeCliArgument(first);
  const { domain, diagnostics } = validationCliDefinition;
  const { unknownSubcommand } = diagnostics;
  process.stderr.write(`spx ${domain.commandName}: ${unknownSubcommand.messageLabel}: ${sanitized}\n`);
  process.exit(unknownSubcommand.exitCode);
}

export const validationDomain: Domain = {
  name: validationCliDefinition.domain.commandName,
  description: validationCliDefinition.domain.description,
  register: (program: Command) => {
    const { domain } = validationCliDefinition;
    const validationCmd = program
      .command(domain.commandName)
      .alias(domain.alias)
      .description(domain.description);

    validationCmd.on("command:*", (operands: readonly string[]) => {
      handleUnknownSubcommand(operands);
    });

    registerValidationCommands(validationCmd);
  },
};
