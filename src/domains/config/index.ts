import type { Command } from "commander";

import { defaultsCommand } from "@/commands/config/defaults";
import { showCommand } from "@/commands/config/show";
import type { CliDeps, CliResult, ShowOptions, ValidateOptions } from "@/commands/config/types";
import { validateCommand } from "@/commands/config/validate";
import { resolveConfig } from "@/config/index";
import { productionRegistry } from "@/config/registry";

import type { Domain } from "../types";
import { resolveProjectRoot } from "./root";

function buildDefaultDeps(): CliDeps {
  return {
    resolveConfig,
    resolveProjectRoot: (): string => {
      const resolved = resolveProjectRoot();
      if (resolved.warning !== undefined) {
        process.stderr.write(`${resolved.warning}\n`);
      }
      return resolved.projectRoot;
    },
    descriptors: productionRegistry,
  };
}

async function emit(result: CliResult): Promise<never> {
  if (result.stdout.length > 0) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr.length > 0) {
    process.stderr.write(result.stderr);
  }
  return process.exit(result.exitCode);
}

function registerConfigCommands(configCmd: Command): void {
  configCmd
    .command("show")
    .description("Print the resolved configuration as YAML (or JSON with --json)")
    .option("--json", "Output as JSON")
    .action(async (options: ShowOptions) => {
      await emit(await showCommand(options, buildDefaultDeps()));
    });

  configCmd
    .command("validate")
    .description("Verify that spx.config.yaml passes every registered descriptor's validator")
    .action(async (options: ValidateOptions) => {
      await emit(await validateCommand(options, buildDefaultDeps()));
    });

  configCmd
    .command("defaults")
    .description("Print each registered descriptor's defaults — ignores spx.config.yaml")
    .option("--json", "Output as JSON")
    .action(async (options: ShowOptions) => {
      await emit(await defaultsCommand(options, buildDefaultDeps()));
    });
}

export const configDomain: Domain = {
  name: "config",
  description: "Inspect and validate the resolved spx configuration",
  register: (program: Command) => {
    const configCmd = program
      .command("config")
      .description("Inspect and validate the resolved spx configuration");
    registerConfigCommands(configCmd);
  },
};
