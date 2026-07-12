/**
 * CLI entry point for spx
 */
import { createCliProgram } from "./interfaces/cli/program";
import { installLifecycle } from "./lib/process-lifecycle";
import { SPX_VERSION } from "./version";

installLifecycle();

createCliProgram({ version: SPX_VERSION }).parse();
