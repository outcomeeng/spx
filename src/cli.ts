/**
 * CLI entry point for spx
 */
import { createRequire } from "node:module";

import { createCliProgram } from "./interfaces/cli/program";
import { installLifecycle } from "./lib/process-lifecycle";

installLifecycle();

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

createCliProgram({ version }).parse();
