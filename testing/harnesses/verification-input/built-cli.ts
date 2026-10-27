/**
 * Built-executable harness for the `spx verification input inspect` command path: runs
 * `node bin/spx.js` from a caller-chosen directory, so l2 evidence exercises the packaged Commander
 * wiring, the standard streams, and the process exit code rather than in-process handlers.
 *
 * @module testing/harnesses/verification-input/built-cli
 */
import { access } from "node:fs/promises";
import { join } from "node:path";

import { execa } from "execa";

import { VERIFICATION_INPUT_CLI_SURFACE, VERIFICATION_RUN_CLI_SURFACE } from "@/interfaces/cli/verify";
import { CLI_PATH, NODE_EXECUTABLE, PRODUCT_ROOT } from "@testing/harnesses/constants";
import { buildGitTestEnvironment } from "@testing/harnesses/git-test-constants";

const BUILT_CLI_BUNDLE = join(PRODUCT_ROOT, "dist", "cli.js");
const BUILT_CLI_MISSING_EXIT_CODE = 1;

/** Captured streams and exit code of one built-executable run. */
export interface BuiltInputInspectRun {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

/** Run `node bin/spx.js verification input inspect <operand>` from `cwd`. */
export async function runBuiltInputInspect(cwd: string, operand: string): Promise<BuiltInputInspectRun> {
  try {
    await access(BUILT_CLI_BUNDLE);
  } catch {
    throw new Error(`built spx executable not found at ${BUILT_CLI_BUNDLE}; run \`pnpm run build\` first`);
  }
  const result = await execa(
    NODE_EXECUTABLE,
    [
      CLI_PATH,
      VERIFICATION_RUN_CLI_SURFACE.rootCommandName,
      VERIFICATION_INPUT_CLI_SURFACE.resourceCommandName,
      VERIFICATION_INPUT_CLI_SURFACE.inspectCommandName,
      operand,
    ],
    { cwd, env: buildGitTestEnvironment(), extendEnv: false, input: "", reject: false },
  );
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode ?? BUILT_CLI_MISSING_EXIT_CODE,
  };
}
