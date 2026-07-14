/**
 * Canonical SPX CLI invocation strings — the single source of truth for
 * how the CLI is invoked from package-script consumers (development source
 * vs. published distribution) and how the formatter pipeline is composed.
 *
 * Higher-level tests import these constants to assert that package scripts
 * conform to the boundary contract.
 */

export const SOURCE_CLI_EXECUTABLE = "tsx";
export const SOURCE_CLI_ENTRYPOINT = "src/cli.ts";
export const PACKAGED_CLI_EXECUTABLE = "node";
export const PACKAGED_CLI_ENTRYPOINT = "bin/spx.js";
export const SPX_PROGRAM_NAME = "spx";

export const CLI_EXIT_CODE = {
  SUCCESS: 0,
  ERROR: 1,
} as const;

export const SOURCE_CLI_INVOCATION = `${SOURCE_CLI_EXECUTABLE} ${SOURCE_CLI_ENTRYPOINT}`;
export const PACKAGED_CLI_INVOCATION = `${PACKAGED_CLI_EXECUTABLE} ${PACKAGED_CLI_ENTRYPOINT}`;

export const FORMAT_INVOCATION = "dprint fmt .";
export const FORMAT_CHECK_INVOCATION = "dprint check .";

export const BUILD_INVOCATION = "pnpm run build";
export const VITEST_RUN_INVOCATION = "vitest run";
export const PREPUBLISH_HOOK_INVOCATION = "pnpm run publish:check";
export const PREPARE_HOOK_ENTRYPOINT = "src/lib/precommit/install-hooks.ts";
export const PREPARE_HOOK_INVOCATION = `tsx ${PREPARE_HOOK_ENTRYPOINT}`;
