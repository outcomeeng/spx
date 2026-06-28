/** spx test CLI arguments used by the precommit runner. */
export const SPX_TEST_ARGS = {
  COMMAND: "test",
  CHANGED: "--changed",
  STAGED: "--staged",
  BASE: "--base",
  BASE_REF: "HEAD",
} as const;
