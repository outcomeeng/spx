import { isAbsolute, join } from "node:path";

import { describe, expect, it } from "vitest";

import { HOOK_ENV_FILE, HOOK_SESSION_START_ENV } from "@/domains/hooks/session-start";
import { CONTROLLING_PROCESS_ERROR } from "@/domains/worktree/controlling-process";
import { sampleWorktreeTestValue, WORKTREE_TEST_GENERATOR } from "@testing/generators/worktree/worktree";
import { withSessionStartHookScenario } from "@testing/harnesses/hooks/session-start";

describe("hook session-start worktree claim", () => {
  it("writes one claim and exports the claim path from a session-start payload", async () => {
    await withSessionStartHookScenario(async (scenario) => {
      const existingExport = await scenario.seedEnvFile();
      const result = await scenario.run({ payloadCarriesSessionId: true });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.value.claimed).toBe(true);
      expect(result.value.claimPath).toBeDefined();
      expect(result.value.diagnostics).toEqual([]);
      expect(result.value.stdout).toHaveLength(0);
      if (result.value.claimPath === undefined) throw new Error("expected claim path");

      const claim = await scenario.readClaim();
      expect(claim.ok).toBe(true);
      if (!claim.ok) throw new Error(claim.error);
      expect(claim.value).toEqual({
        sessionId: scenario.sessionId,
        host: scenario.pool.holder.host,
        pid: scenario.pool.holder.pid,
        startedAt: scenario.pool.holder.startedAt,
      });

      const envContent = await scenario.readEnvFile();
      expect(envContent.startsWith(existingExport)).toBe(true);
      expect(envContent).toContain(
        `${HOOK_ENV_FILE.EXPORT_PREFIX}${HOOK_SESSION_START_ENV.CLAUDE_PROJECT_DIR}='${scenario.pool.worktreePath}'`,
      );
      expect(envContent).toContain(
        `${HOOK_ENV_FILE.EXPORT_PREFIX}${HOOK_SESSION_START_ENV.PROJECT_DIR}='${scenario.pool.worktreePath}'`,
      );
      expect(envContent).toContain(
        `${HOOK_ENV_FILE.EXPORT_PREFIX}${HOOK_SESSION_START_ENV.SPX_WORKTREE_CLAIM_PATH}='${result.value.claimPath}'`,
      );
    });
  });

  it("exports an absolute claim path from a relative worktrees directory", async () => {
    const relativeWorktreesDir = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());

    await withSessionStartHookScenario(async (scenario) => {
      const result = await scenario.run({ payloadCarriesSessionId: true, worktreesDir: relativeWorktreesDir });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.value.claimPath).toBeDefined();
      if (result.value.claimPath === undefined) throw new Error("expected claim path");
      expect(isAbsolute(result.value.claimPath)).toBe(true);

      const claim = await scenario.readClaim(join(scenario.pool.worktreePath, relativeWorktreesDir));
      expect(claim.ok).toBe(true);
      if (!claim.ok) throw new Error(claim.error);
      expect(claim.value?.sessionId).toBe(scenario.sessionId);

      const envContent = await scenario.readEnvFile();
      expect(envContent).toContain(
        `${HOOK_ENV_FILE.EXPORT_PREFIX}${HOOK_SESSION_START_ENV.SPX_WORKTREE_CLAIM_PATH}='${result.value.claimPath}'`,
      );
    });
  });

  it("writes project exports and clears the claim path when no session identity is available", async () => {
    await withSessionStartHookScenario(async (scenario) => {
      const result = await scenario.run({ payloadCarriesSessionId: false });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.value.claimed).toBe(false);
      expect(result.value.claimPath).toBeUndefined();
      expect(result.value.sessionId).toBeUndefined();

      const envContent = await scenario.readEnvFile();
      expect(envContent).toContain(
        `${HOOK_ENV_FILE.EXPORT_PREFIX}${HOOK_SESSION_START_ENV.CLAUDE_PROJECT_DIR}='${scenario.pool.worktreePath}'`,
      );
      expect(envContent).toContain(
        `${HOOK_ENV_FILE.EXPORT_PREFIX}${HOOK_SESSION_START_ENV.PROJECT_DIR}='${scenario.pool.worktreePath}'`,
      );
      expect(envContent).not.toContain(
        `${HOOK_ENV_FILE.EXPORT_PREFIX}${HOOK_SESSION_START_ENV.SPX_WORKTREE_CLAIM_PATH}=`,
      );
      expect(envContent).toContain(`${HOOK_ENV_FILE.UNSET_PREFIX}${HOOK_SESSION_START_ENV.SPX_WORKTREE_CLAIM_PATH}`);
    });
  });

  it("degrades and clears the claim path when the claim cannot resolve a holder", async () => {
    await withSessionStartHookScenario(async (scenario) => {
      const result = await scenario.run({
        payloadCarriesSessionId: true,
        env: { [HOOK_SESSION_START_ENV.CLAUDE_ENV_FILE]: scenario.envFile },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.value.claimed).toBe(false);
      expect(result.value.claimPath).toBeUndefined();
      expect(result.value.diagnostics).toContain(CONTROLLING_PROCESS_ERROR.UNRESOLVED);

      const envContent = await scenario.readEnvFile();
      expect(envContent).not.toContain(
        `${HOOK_ENV_FILE.EXPORT_PREFIX}${HOOK_SESSION_START_ENV.SPX_WORKTREE_CLAIM_PATH}=`,
      );
      expect(envContent).toContain(`${HOOK_ENV_FILE.UNSET_PREFIX}${HOOK_SESSION_START_ENV.SPX_WORKTREE_CLAIM_PATH}`);
    });
  });
});
