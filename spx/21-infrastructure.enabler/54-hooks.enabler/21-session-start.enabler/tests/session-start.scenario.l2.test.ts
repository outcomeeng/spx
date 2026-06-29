import { readFile } from "node:fs/promises";
import { basename } from "node:path";

import { describe, expect, it } from "vitest";

import { HOOK_ENV_FILE, HOOK_SESSION_START_ENV, HOOK_SESSION_START_PAYLOAD } from "@/domains/hooks/session-start";
import { CONTROLLING_PID_ENV } from "@/domains/worktree/controlling-process";
import { OCCUPANCY_CLAIM, readClaim } from "@/domains/worktree/occupancy-store";
import { worktreeClaimName } from "@/domains/worktree/worktree-name";
import { HOOK_CLI } from "@/interfaces/cli/hook";
import { HOOK_EVENT } from "@/interfaces/hooks/registry";
import { defaultOccupancyFileSystem } from "@/lib/worktree-occupancy-file-system";
import { sampleWorktreeTestValue, WORKTREE_TEST_GENERATOR } from "@testing/generators/worktree/worktree";
import { withHookCliWorktreeEnv } from "@testing/harnesses/hook-cli";
import { runWorktreeCli } from "@testing/harnesses/worktree/harness";

async function readHookEnvFile(envFile: string): Promise<string> {
  return readFile(envFile, HOOK_ENV_FILE.ENCODING);
}

function expectHookEnvExport(envContent: string, name: string, value: string): void {
  expect(envContent).toContain(`${HOOK_ENV_FILE.EXPORT_PREFIX}${name}=${value}`);
}

describe("hook CLI session-start boundary", () => {
  it("writes the worktree claim and exports SPX_WORKTREE_CLAIM_PATH", async () => {
    const prefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());
    const worktreeName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());
    const sessionId = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());
    const envFileName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.envFileName());

    await withHookCliWorktreeEnv({ envFileName, prefix, worktreeName }, async (env) => {
      const result = await runWorktreeCli(
        [
          HOOK_CLI.COMMAND,
          HOOK_CLI.RUN,
          HOOK_EVENT.SESSION_START,
          HOOK_CLI.ENV_FILE_FLAG,
          env.envFile,
          HOOK_CLI.WORKTREES_DIR_FLAG,
          env.worktreesDir,
        ],
        {
          [CONTROLLING_PID_ENV]: String(process.pid),
        },
        env.worktreePath,
        JSON.stringify({
          [HOOK_SESSION_START_PAYLOAD.SESSION_ID]: sessionId,
          [HOOK_SESSION_START_PAYLOAD.CWD]: env.worktreePath,
        }),
      );

      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stdout).toHaveLength(0);

      const claimName = worktreeClaimName(basename(env.worktreePath));
      const claim = await readClaim(env.worktreesDir, claimName, { fs: defaultOccupancyFileSystem });
      expect(claim.ok).toBe(true);
      if (!claim.ok) throw new Error(claim.error);
      expect(claim.value?.sessionId).toBe(sessionId);
      expect(claim.value?.pid).toBe(process.pid);
      expect(claim.value?.host.length).toBeGreaterThan(0);
      expect(claim.value?.startedAt.length).toBeGreaterThan(0);

      const envContent = await readHookEnvFile(env.envFile);
      expectHookEnvExport(envContent, HOOK_SESSION_START_ENV.CLAUDE_SESSION_ID, sessionId);
      expectHookEnvExport(envContent, HOOK_SESSION_START_ENV.CLAUDE_PROJECT_DIR, `'${env.worktreePath}'`);
      expectHookEnvExport(envContent, HOOK_SESSION_START_ENV.PROJECT_DIR, `'${env.worktreePath}'`);
      expectHookEnvExport(
        envContent,
        HOOK_SESSION_START_ENV.SPX_WORKTREE_CLAIM_PATH,
        `'${env.worktreesDir}/${claimName}${OCCUPANCY_CLAIM.FILE_EXTENSION}'`,
      );
    });
  });
});
