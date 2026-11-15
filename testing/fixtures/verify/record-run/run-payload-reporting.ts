import { VERIFY_VERIFICATION_TYPE } from "@/domains/verify/verify";

/**
 * The inert values the run payload reporting Scenarios of `spx verification run paths` and `start`
 * state: the product-relative file the repository's HEAD commit holds and both runs scope, the
 * verification type both runs name, and the run input `start` reads from standard input.
 */
export const RUN_PAYLOAD_REPORTING_FIXTURE = {
  filePath: "src/index.ts",
  verificationType: VERIFY_VERIFICATION_TYPE.AUDIT,
  input: `{"subject": "write paths"}`,
} as const;
