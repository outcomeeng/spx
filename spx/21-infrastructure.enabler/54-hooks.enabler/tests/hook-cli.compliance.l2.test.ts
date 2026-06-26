import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import {
  HOOK_ENV_FILE,
  HOOK_SESSION_START_CLAIMED,
  HOOK_SESSION_START_ENV,
  HOOK_SESSION_START_PAYLOAD,
  HOOK_SESSION_START_SOURCE,
} from "@/domains/hooks/session-start";
import { CONTROLLING_PID_ENV } from "@/domains/worktree/controlling-process";
import { HOOK_CLI } from "@/interfaces/cli/hook";
import { HOOK_EVENT } from "@/interfaces/hooks/registry";
import { sampleWorktreeTestValue, WORKTREE_TEST_GENERATOR } from "@testing/generators/worktree/worktree";
import { withHookCliWorktreeEnv } from "@testing/harnesses/hook-cli";
import { withTempDir } from "@testing/harnesses/with-temp-dir";
import { runWorktreeCli } from "@testing/harnesses/worktree/harness";

interface SuccessfulHookCliRunInput {
  readonly envFileName: string;
  readonly prefix: string;
  readonly sessionId: string;
  readonly useEnvFileFlag: boolean;
  readonly worktreeName: string;
}

async function runSuccessfulSessionStartHookCli(input: SuccessfulHookCliRunInput): Promise<string> {
  let envContent = "";

  await withHookCliWorktreeEnv(
    { envFileName: input.envFileName, prefix: input.prefix, worktreeName: input.worktreeName },
    async (env) => {
      const envFileArgs = input.useEnvFileFlag ? [HOOK_CLI.ENV_FILE_FLAG, env.envFile] : [];
      const envOverlay: Record<string, string> = { [CONTROLLING_PID_ENV]: String(process.pid) };
      if (!input.useEnvFileFlag) {
        envOverlay[HOOK_SESSION_START_ENV.CLAUDE_ENV_FILE] = env.envFile;
      }

      const result = await runWorktreeCli(
        [
          HOOK_CLI.COMMAND,
          HOOK_CLI.RUN,
          HOOK_EVENT.SESSION_START,
          ...envFileArgs,
          HOOK_CLI.WORKTREES_DIR_FLAG,
          env.worktreesDir,
        ],
        envOverlay,
        env.worktreePath,
        JSON.stringify({
          [HOOK_SESSION_START_PAYLOAD.SESSION_ID]: input.sessionId,
          [HOOK_SESSION_START_PAYLOAD.CWD]: env.worktreePath,
          [HOOK_SESSION_START_PAYLOAD.SOURCE]: HOOK_SESSION_START_SOURCE.STARTUP,
        }),
      );

      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stdout).toHaveLength(0);
      envContent = await readFile(env.envFile, HOOK_ENV_FILE.ENCODING);
    },
  );

  return envContent;
}

function expectHookCliClaimedEnv(envContent: string, sessionId: string): void {
  expect(envContent).toContain(
    `${HOOK_ENV_FILE.EXPORT_PREFIX}${HOOK_SESSION_START_ENV.CLAUDE_SESSION_ID}=${sessionId}`,
  );
  expect(envContent).toContain(
    `${HOOK_ENV_FILE.EXPORT_PREFIX}${HOOK_SESSION_START_ENV.CLAUDE_WORKTREE_CLAIMED}=${HOOK_SESSION_START_CLAIMED.TRUE}`,
  );
}

describe("hook CLI compliance", () => {
  it("ALWAYS: hook run session-start reads hook stdin, writes no stdout on a non-compact source, exits 0, claims once, and writes the hook env file", async () => {
    const prefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());
    const worktreeName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());
    const sessionId = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());
    const envFileName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.envFileName());

    const envContent = await runSuccessfulSessionStartHookCli({
      envFileName,
      prefix,
      sessionId,
      useEnvFileFlag: false,
      worktreeName,
    });

    expectHookCliClaimedEnv(envContent, sessionId);
  });

  it("ALWAYS: hook run session-start writes the hook env file named by the CLI flag", async () => {
    const prefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());
    const worktreeName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());
    const sessionId = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());
    const envFileName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.envFileName());

    const envContent = await runSuccessfulSessionStartHookCli({
      envFileName,
      prefix,
      sessionId,
      useEnvFileFlag: true,
      worktreeName,
    });

    expectHookCliClaimedEnv(envContent, sessionId);
  });

  it("ALWAYS: an unknown hook event exits non-zero with a diagnostic", async () => {
    const prefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());
    const unknownEvent = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());

    await withTempDir(prefix, async (worktreesDir) => {
      const result = await runWorktreeCli(
        [HOOK_CLI.COMMAND, HOOK_CLI.RUN, unknownEvent, HOOK_CLI.WORKTREES_DIR_FLAG, worktreesDir],
        {},
        worktreesDir,
      );

      expect(result.exitCode).not.toBe(0);
      expect(result.stdout).toHaveLength(0);
      expect(result.stderr.length).toBeGreaterThan(0);
    });
  });
});
