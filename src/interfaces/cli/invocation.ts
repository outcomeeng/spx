/**
 * Canonical SPX CLI invocation strings — the single source of truth for
 * how the CLI is invoked from package-script consumers (development source
 * vs. published distribution) and how the formatter pipeline is composed.
 *
 * Tests under `spx/13-cli.enabler/` import these constants to assert that
 * `package.json` scripts conform to the boundary contract.
 */

export const SOURCE_CLI_INVOCATION = "tsx src/cli.ts";
export const PACKAGED_CLI_INVOCATION = "node bin/spx.js";

export const FORMAT_INVOCATION = "dprint fmt .";
export const FORMAT_CHECK_INVOCATION = "dprint check .";

export const BUILD_INVOCATION = "pnpm run build";
export const VITEST_RUN_INVOCATION = "vitest run";
export const PREPUBLISH_HOOK_INVOCATION = "pnpm run publish:check";
