/**
 * How a built SPX distribution is invoked: the packaged executable, which the release publication
 * workflow runs after `pnpm run build` produces `dist/cli.js`.
 */
export const PACKAGED_CLI_INVOCATION = "node bin/spx.js";
