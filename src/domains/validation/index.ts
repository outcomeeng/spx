/**
 * Validation domain - Run code validation tools
 *
 * Provides CLI commands for running validation tools (TypeScript, ESLint, etc.)
 * as a globally-installed tool across TypeScript projects.
 */
import type { Command } from "commander";

import {
  allCommand,
  circularCommand,
  knipCommand,
  lintCommand,
  markdownCommand,
  typescriptCommand,
} from "../../commands/validation";
import type { Domain } from "../types";

/** Validation scope options */
type ValidationScope = "full" | "production";

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

/**
 * Register validation domain commands
 */
function registerValidationCommands(validationCmd: Command): void {
  // typescript command
  const tsCmd = validationCmd
    .command("typescript")
    .alias("ts")
    .description("Run TypeScript type checking")
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
  const lintCmd = validationCmd
    .command("lint")
    .description("Run ESLint")
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
  const circularCmd = validationCmd
    .command("circular")
    .description("Check for circular dependencies")
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
  const knipCmd = validationCmd
    .command("knip")
    .description("Detect unused code")
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

  // markdown command
  const markdownCmd = validationCmd
    .command("markdown")
    .alias("md")
    .description("Validate markdown link integrity and structure")
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

  // all command (default)
  const allCmd = validationCmd
    .command("all", { isDefault: true })
    .description("Run all validations")
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
export const validationDomain: Domain = {
  name: "validation",
  description: "Run code validation tools",
  register: (program: Command) => {
    const validationCmd = program
      .command("validation")
      .alias("v")
      .description("Run code validation tools");

    registerValidationCommands(validationCmd);
  },
};
