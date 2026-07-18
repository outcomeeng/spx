import { describe, expect, it } from "vitest";

import { HOOK_ENV_FILE, HOOK_SESSION_START_ENV } from "@/domains/hooks/session-start";
import { OCCUPANCY_STATUS } from "@/domains/worktree/occupancy-store";
import {
  withPiSessionStartCliClaimEvidence,
  withSessionStartCliClaimEvidence,
} from "@testing/harnesses/hooks/session-start";

describe("hook CLI session-start boundary", () => {
  it("writes the worktree claim and exports SPX_WORKTREE_CLAIM_PATH", async () => {
    await withSessionStartCliClaimEvidence((evidence) => {
      expect(evidence.result.exitCode, evidence.result.stderr).toBe(0);
      expect(evidence.result.stdout).toHaveLength(0);
      expect(evidence.claim?.sessionId).toBe(evidence.sessionId);
      expect(evidence.claim?.pid).toBe(evidence.pid);
      expect(evidence.claim?.host).toBe(evidence.host);
      expect(evidence.claim?.startedAt).toBe(evidence.startedAt);
      expect(evidence.envContent.startsWith(evidence.originalEnvLine)).toBe(true);
      expect(evidence.envContent).toContain(
        `${HOOK_ENV_FILE.EXPORT_PREFIX}${HOOK_SESSION_START_ENV.CLAUDE_SESSION_ID}=${evidence.sessionId}`,
      );
      expect(evidence.envContent).toContain(
        `${HOOK_ENV_FILE.EXPORT_PREFIX}${HOOK_SESSION_START_ENV.CLAUDE_PROJECT_DIR}=`,
      );
      expect(evidence.envContent).toContain(evidence.productDir);
      expect(evidence.envContent).toContain(
        `${HOOK_ENV_FILE.EXPORT_PREFIX}${HOOK_SESSION_START_ENV.PROJECT_DIR}=`,
      );
      expect(evidence.envContent).toContain(
        `${HOOK_ENV_FILE.EXPORT_PREFIX}${HOOK_SESSION_START_ENV.SPX_WORKTREE_CLAIM_PATH}=`,
      );
      expect(evidence.envContent).toContain(evidence.claimPath);
    });
  });

  it("claims the linked worktree under the Pi native session identity", async () => {
    await withPiSessionStartCliClaimEvidence((evidence) => {
      expect(evidence.hookResult.exitCode, evidence.hookResult.stderr).toBe(0);
      expect(evidence.hookResult.stdout).toHaveLength(0);
      expect(evidence.statusResult.exitCode, evidence.statusResult.stderr).toBe(0);
      expect(JSON.parse(evidence.statusResult.stdout)).toEqual(
        expect.objectContaining({
          status: OCCUPANCY_STATUS.RUNNING,
          session: evidence.sessionId,
        }),
      );
      expect(JSON.parse(evidence.statusResult.stdout)).not.toEqual(
        expect.objectContaining({ session: evidence.decoySessionId }),
      );
    });
  });
});
