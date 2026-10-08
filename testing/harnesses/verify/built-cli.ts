/**
 * Built-executable harness for the `spx verification run` command paths: runs `node bin/spx.js`
 * against a real Git repository in a temporary directory, so l2 evidence exercises the packaged
 * Commander wiring, standard-input reading, and process exit codes rather than in-process handlers.
 *
 * @module testing/harnesses/verify/built-cli
 */

import { access } from "node:fs/promises";
import { join } from "node:path";

import { execa } from "execa";

import { JOURNAL_CLI_ENV } from "@/commands/journal/cli";
import { VERIFY_CLI_EXIT_CODE, type VerifyStartReport, type VerifyStatusReport } from "@/commands/verify/cli";
import { JOURNAL_BACKEND } from "@/domains/journal/backend-selection";
import {
  VERIFY_INPUT_SOURCE,
  VERIFY_SCOPE_SEPARATOR,
  VERIFY_SCOPE_TYPE,
  VERIFY_VERIFICATION_TYPE,
} from "@/domains/verify/verify";
import { VERIFICATION_RUN_CLI_SURFACE, VERIFY_CLI } from "@/interfaces/cli/verify";
import { CHANGE_RUNS_TEST_GENERATOR } from "@testing/generators/verify/change-runs";
import { sampleVerifyTestValue, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import { CLI_PATH, NODE_EXECUTABLE, PRODUCT_ROOT } from "@testing/harnesses/constants";
import { buildGitTestEnvironment } from "@testing/harnesses/git-test-constants";
import { withChangeRunsRepository } from "@testing/harnesses/verify/change-runs";

/** The bundle `bin/spx.js` loads; absent until `pnpm run build` produces it. */
const BUILT_CLI_BUNDLE = join(PRODUCT_ROOT, "dist", "cli.js");
const BUILT_CLI_MISSING_EXIT_CODE = 1;

/** Captured streams and exit code of one built-executable run. */
export interface BuiltVerificationCliRun {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

/** The two built-executable runs a `start --change` scenario makes, and the run state `status` reports back. */
export interface BuiltRunStartChangeObservation {
  readonly start: BuiltVerificationCliRun;
  readonly status?: BuiltVerificationCliRun;
  readonly statusReport?: VerifyStatusReport;
}

/** Fail loudly before any scenario runs when the built executable is absent. */
async function requireBuiltCli(): Promise<void> {
  try {
    await access(BUILT_CLI_BUNDLE);
  } catch {
    throw new Error(`built spx executable not found at ${BUILT_CLI_BUNDLE}; run \`pnpm run build\` first`);
  }
}

/**
 * The child environment: the caller's environment cleaned of Git overrides, with the journal bound
 * to the local backend and no branch override, so a CI pull-request environment cannot route the
 * run to a hosted backend or file it under another branch.
 */
function builtCliEnvironment(): NodeJS.ProcessEnv {
  const env = buildGitTestEnvironment();
  delete env[JOURNAL_CLI_ENV.BRANCH];
  return { ...env, [JOURNAL_CLI_ENV.BACKEND]: JOURNAL_BACKEND.LOCAL };
}

function flagOf(optionExpression: string): string {
  const [flag] = optionExpression.split(" ");
  return flag;
}

/** Run `node bin/spx.js verification run <commandPath> <options>` from `cwd`, piping `input` to stdin. */
export async function runBuiltVerificationRun(
  cwd: string,
  commandPath: readonly string[],
  options: readonly string[],
  input?: string,
): Promise<BuiltVerificationCliRun> {
  await requireBuiltCli();
  const result = await execa(
    NODE_EXECUTABLE,
    [
      CLI_PATH,
      VERIFICATION_RUN_CLI_SURFACE.rootCommandName,
      VERIFICATION_RUN_CLI_SURFACE.runCommandName,
      ...commandPath,
      ...options,
    ],
    { cwd, env: builtCliEnvironment(), extendEnv: false, input: input ?? "", reject: false },
  );
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode ?? BUILT_CLI_MISSING_EXIT_CODE,
  };
}

/**
 * In a real Git repository with a base and a head commit, run the built `spx verification run start`
 * for a changeset-scoped review run with `--change <change>` and generated input on stdin, then — when
 * `start` succeeds — the built `spx verification run status` for the run token it reported.
 */
export async function observeBuiltRunStartChange(change: string): Promise<BuiltRunStartChangeObservation> {
  const scenario = sampleVerifyTestValue(CHANGE_RUNS_TEST_GENERATOR.scenario());
  const input = JSON.stringify(sampleVerifyTestValue(VERIFY_TEST_GENERATOR.inputPayload()));
  return withChangeRunsRepository(scenario, async (repository) => {
    const selectors = [
      flagOf(VERIFY_CLI.verificationTypeOption),
      VERIFY_VERIFICATION_TYPE.REVIEW,
      flagOf(VERIFY_CLI.scopeTypeOption),
      VERIFY_SCOPE_TYPE.CHANGESET,
      flagOf(VERIFY_CLI.scopeOption),
      `${repository.baseCommit}${VERIFY_SCOPE_SEPARATOR}${repository.headCommit}`,
    ];
    const start = await runBuiltVerificationRun(
      repository.productDir,
      [VERIFY_CLI.startCommandName],
      [
        ...selectors,
        flagOf(VERIFY_CLI.inputOption),
        VERIFY_INPUT_SOURCE.STDIN,
        flagOf(VERIFY_CLI.changeOption),
        change,
      ],
      input,
    );
    if (start.exitCode !== VERIFY_CLI_EXIT_CODE.OK) return { start };
    const { runToken } = JSON.parse(start.stdout) as VerifyStartReport;
    const status = await runBuiltVerificationRun(
      repository.productDir,
      [VERIFY_CLI.statusCommandName],
      [...selectors, flagOf(VERIFY_CLI.runOption), runToken],
    );
    if (status.exitCode !== VERIFY_CLI_EXIT_CODE.OK) return { start, status };
    return { start, status, statusReport: JSON.parse(status.stdout) as VerifyStatusReport };
  });
}
