/**
 * CLI entry point for spx
 */
import { Command } from "commander";
import { createRequire } from "node:module";

import { auditDomain } from "./domains/audit/cli";
import { validationDomain } from "./domains/validation";
import { claudeDomain } from "./interfaces/cli/claude";
import { configDomain } from "./interfaces/cli/config";
import { sessionDomain } from "./interfaces/cli/session";
import { specDomain } from "./interfaces/cli/spec";
import { installLifecycle } from "./lib/process-lifecycle";

installLifecycle();

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

const program = new Command();

program
  .name("spx")
  .description("Fast, deterministic CLI tool for spec workflow management")
  .version(version);

// Register domains
auditDomain.register(program);
claudeDomain.register(program);
configDomain.register(program);
sessionDomain.register(program);
specDomain.register(program);
validationDomain.register(program);

program.parse();
