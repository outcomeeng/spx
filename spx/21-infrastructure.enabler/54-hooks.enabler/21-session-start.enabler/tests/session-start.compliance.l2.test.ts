import { describe, expect, it } from "vitest";

import { HOOK_SESSION_START_ENV, HOOK_SESSION_START_PAYLOAD } from "@/domains/hooks/session-start";
import { CONTROLLING_PID_ENV } from "@/domains/worktree/controlling-process";
import { HOOK_CLI } from "@/interfaces/cli/hook";
import { HOOK_EVENT } from "@/interfaces/hooks/registry";
import { sampleWorktreeTestValue, WORKTREE_TEST_GENERATOR } from "@testing/generators/worktree/worktree";
import { withHookCliWorktreeEnv } from "@testing/harnesses/hook-cli";
import { runWorktreeCli } from "@testing/harnesses/worktree/harness";

interface SuccessfulHookCliRunInput {
  readonly envFileName: string;
  readonly prefix: string;
  readonly sessionId: string;
  readonly worktreeName: string;
}

async function expectSessionStartHookCliAccepted(input: SuccessfulHookCliRunInput): Promise<void> {
  await withHookCliWorktreeEnv(
    { envFileName: input.envFileName, prefix: input.prefix, worktreeName: input.worktreeName },
    async (env) => {
      const result = await runWorktreeCli(
        [
          HOOK_CLI.COMMAND,
          HOOK_CLI.RUN,
          HOOK_EVENT.SESSION_START,
          HOOK_CLI.WORKTREES_DIR_FLAG,
          env.worktreesDir,
        ],
        {
          [CONTROLLING_PID_ENV]: String(process.pid),
          [HOOK_SESSION_START_ENV.CLAUDE_ENV_FILE]: env.envFile,
        },
        env.worktreePath,
        JSON.stringify({
          [HOOK_SESSION_START_PAYLOAD.SESSION_ID]: input.sessionId,
          [HOOK_SESSION_START_PAYLOAD.CWD]: env.worktreePath,
        }),
      );

      expect(result.exitCode, result.stderr).toBe(0);
    },
  );
}

describe("hook CLI compliance", () => {
  it("ALWAYS: hook run accepts session-start as the first required event operand", async () => {
    const prefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());
    const worktreeName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());
    const sessionId = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());
    const envFileName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.envFileName());

    await expectSessionStartHookCliAccepted({
      envFileName,
      prefix,
      sessionId,
      worktreeName,
    });
  });
});
