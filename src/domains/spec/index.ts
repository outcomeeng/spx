/**
 * Spec domain - Manage spec workflow
 */
import { access, readFile, writeFile } from "node:fs/promises";

import type { Command } from "commander";

import { APPLY_HELP } from "../../spec/apply/exclude/help.js";
import { applyExcludeCommand } from "../../spec/apply/exclude/index.js";
import type { Domain } from "../types.js";

function registerSpecCommands(specCmd: Command): void {
  specCmd
    .command("apply")
    .description("Apply spec-tree state to project configuration")
    .addHelpText("after", APPLY_HELP)
    .action(async () => {
      const result = await applyExcludeCommand({
        cwd: process.cwd(),
        deps: {
          readFile: (path: string) => readFile(path, "utf-8"),
          writeFile: (path: string, content: string) => writeFile(path, content, "utf-8"),
          fileExists: async (path: string) => {
            try {
              await access(path);
              return true;
            } catch {
              return false;
            }
          },
        },
      });
      if (result.output) console.log(result.output);
      process.exit(result.exitCode);
    });
}

/**
 * Spec domain - Manage spec workflow
 */
export const specDomain: Domain = {
  name: "spec",
  description: "Manage spec workflow",
  register: (program: Command) => {
    const specCmd = program
      .command("spec")
      .description("Manage spec workflow");

    registerSpecCommands(specCmd);
  },
};
