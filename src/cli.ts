/**
 * CLI entry point for spx
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { createCliProgram } from "./interfaces/cli/program";
import { installLifecycle } from "./lib/process-lifecycle";

installLifecycle();

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };
const packageRoot = fileURLToPath(new URL("..", import.meta.url));

createCliProgram({ version, packageRoot }).parse();
