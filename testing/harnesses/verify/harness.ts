import { join } from "node:path";

import {
  VERIFY_CLI_EXIT_CODE,
  type VerifyCliDeps,
  type VerifyInputCliOptions,
  type VerifyInputReport,
  type VerifyStartCliOptions,
  verifyStartCommand,
  type VerifyStartReport,
} from "@/commands/verify/cli";
import { VERIFY_INPUT_SOURCE, VERIFY_SCOPE_SEPARATOR, VERIFY_SCOPE_TYPE } from "@/domains/verify/verify";
import {
  type ExecResult,
  GIT_COMMON_DIR_ARGS,
  GIT_CURRENT_BRANCH_ARGS,
  GIT_DIR_BASENAME,
  GIT_HEAD_SHA_ARGS,
  GIT_SHOW_TOPLEVEL_ARGS,
  type GitDependencies,
} from "@/git/root";
import { GIT_NAME_STATUS_FLAG } from "@/lib/git/name-status";
import { sampleStateStoreTestValue, STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";
import { formatNameStatusZ, sampleVerifyTestValue, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import { createInMemoryStateStoreFileSystem } from "@testing/harnesses/state/in-memory-file-system";

const GIT_UNEXPECTED_COMMAND: ExecResult = {
  exitCode: VERIFY_CLI_EXIT_CODE.ERROR,
  stdout: "",
  stderr: "verify harness: unexpected git command",
};

export type VerifyStateStoreFileSystem = ReturnType<typeof createInMemoryStateStoreFileSystem>;

export interface VerifyRunContextScenario {
  readonly verificationType: string;
  readonly base: string;
  readonly head: string;
  readonly scope: string;
  readonly changedPaths: readonly string[];
  readonly nameStatusStdout: string;
  readonly inputContent: string;
  readonly branchIdentity: string;
  readonly headSha: string;
  readonly productDir: string;
  readonly launchedAt: Date;
}

export function createVerifyRunContextScenario(): VerifyRunContextScenario {
  const range = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.changesetRange());
  const changedPaths = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.changedPaths());
  return {
    verificationType: sampleVerifyTestValue(VERIFY_TEST_GENERATOR.verificationType()),
    base: range.base,
    head: range.head,
    scope: `${range.base}${VERIFY_SCOPE_SEPARATOR}${range.head}`,
    changedPaths,
    nameStatusStdout: formatNameStatusZ(changedPaths),
    inputContent: JSON.stringify(sampleVerifyTestValue(VERIFY_TEST_GENERATOR.inputPayload())),
    branchIdentity: sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.branchIdentity()),
    headSha: sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.headSha()),
    productDir: sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.productRoot()),
    launchedAt: sampleVerifyTestValue(VERIFY_TEST_GENERATOR.launchedAt()),
  };
}

export function withChangedPaths(
  scenario: VerifyRunContextScenario,
  changedPaths: readonly string[],
): VerifyRunContextScenario {
  return { ...scenario, changedPaths, nameStatusStdout: formatNameStatusZ(changedPaths) };
}

export function withScope(
  scenario: VerifyRunContextScenario,
  base: string,
  head: string,
): VerifyRunContextScenario {
  return { ...scenario, base, head, scope: `${base}${VERIFY_SCOPE_SEPARATOR}${head}` };
}

export function withVerificationType(
  scenario: VerifyRunContextScenario,
  verificationType: string,
): VerifyRunContextScenario {
  return { ...scenario, verificationType };
}

export async function startReportFor(scenario: VerifyRunContextScenario): Promise<VerifyStartReport> {
  const fs = createInMemoryStateStoreFileSystem();
  const started = await verifyStartCommand(verifyStartOptions(scenario), verifyDeps(scenario, fs));
  if (started.exitCode !== VERIFY_CLI_EXIT_CODE.OK) {
    throw new Error(`verify start failed in harness: ${started.output}`);
  }
  return parseStartReport(started.output);
}

export function verifyStartOptions(scenario: VerifyRunContextScenario): VerifyStartCliOptions {
  return {
    verificationType: scenario.verificationType,
    scopeType: VERIFY_SCOPE_TYPE.CHANGESET,
    scope: scenario.scope,
    input: VERIFY_INPUT_SOURCE.STDIN,
  };
}

export function verifyInputOptions(scenario: VerifyRunContextScenario, runToken: string): VerifyInputCliOptions {
  return {
    verificationType: scenario.verificationType,
    scopeType: VERIFY_SCOPE_TYPE.CHANGESET,
    scope: scenario.scope,
    run: runToken,
  };
}

function gitSuccess(stdout: string): ExecResult {
  return { exitCode: VERIFY_CLI_EXIT_CODE.OK, stdout, stderr: "" };
}

export function verifyGitDeps(scenario: VerifyRunContextScenario): GitDependencies {
  return {
    execa: async (_command, args) => {
      const argLine = args.join(" ");
      if (argLine === GIT_SHOW_TOPLEVEL_ARGS.join(" ")) return gitSuccess(scenario.productDir);
      if (argLine === GIT_COMMON_DIR_ARGS.join(" ")) return gitSuccess(join(scenario.productDir, GIT_DIR_BASENAME));
      if (argLine === GIT_CURRENT_BRANCH_ARGS.join(" ")) return gitSuccess(scenario.branchIdentity);
      if (argLine === GIT_HEAD_SHA_ARGS.join(" ")) return gitSuccess(scenario.headSha);
      if (args.includes(GIT_NAME_STATUS_FLAG)) return gitSuccess(scenario.nameStatusStdout);
      return GIT_UNEXPECTED_COMMAND;
    },
  };
}

export function verifyDeps(scenario: VerifyRunContextScenario, fs: VerifyStateStoreFileSystem): VerifyCliDeps {
  return {
    cwd: scenario.productDir,
    fs,
    git: verifyGitDeps(scenario),
    processEnv: {},
    now: () => scenario.launchedAt,
    readInputSource: async () => scenario.inputContent,
  };
}

export function parseStartReport(output: string): VerifyStartReport {
  return JSON.parse(output) as VerifyStartReport;
}

export function parseInputReport(output: string): VerifyInputReport {
  return JSON.parse(output) as VerifyInputReport;
}

export interface RecordingInputReader {
  /** A `readInputSource` capability that records each invocation; the input verb must never call it. */
  readonly read: (source: string) => Promise<string>;
  /** How many times `read` has been invoked. */
  calls(): number;
}

/**
 * A recording input-reader double (Stage-5 exception 2, interaction protocol): it counts calls
 * and echoes the source it was handed, so a test can prove the input verb replays the recorded
 * input without ever reading a fresh source — by asserting the reader was called zero times.
 */
export function createRecordingInputReader(): RecordingInputReader {
  let count = 0;
  return {
    read: (source: string) => {
      count += 1;
      return Promise.resolve(source);
    },
    calls: () => count,
  };
}
