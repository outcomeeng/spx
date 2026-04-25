/**
 * CLI entry point for spx
 */
import { Command } from "commander";
import { createRequire } from "node:module";
import { auditDomain } from "./audit/cli";
import { claudeDomain } from "./domains/claude";
import { configDomain } from "./domains/config";
import { sessionDomain } from "./domains/session";
import { specDomain } from "./domains/spec";
import { validationDomain } from "./domains/validation";

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
