/**
 * CLI entry point for spx
 */
import { Command } from "commander";
import { createRequire } from "node:module";

import { CLI_DOMAINS } from "./interfaces/cli/registry";
import { installLifecycle } from "./lib/process-lifecycle";

installLifecycle();

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

const program = new Command();

program
  .name("spx")
  .description("Fast, deterministic CLI tool for spec workflow management")
  .version(version);

for (const domain of CLI_DOMAINS) {
  domain.register(program);
}

program.parse();
