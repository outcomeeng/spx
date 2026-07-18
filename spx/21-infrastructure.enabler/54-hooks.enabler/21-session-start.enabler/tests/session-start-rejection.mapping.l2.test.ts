import { describe, expect, it } from "vitest";

import {
  HOOK_ENV_FILE,
  HOOK_SESSION_START_ENV,
  PI_SESSION_START_REJECTION_REGISTRY,
} from "@/domains/hooks/session-start";
import { OCCUPANCY_STATUS } from "@/domains/worktree/occupancy-store";
import { withPiSessionStartCliRejectionMappingEvidence } from "@testing/harnesses/hooks/session-start";

describe("packaged hook session-start Pi rejection mapping", () => {
  it("maps every source-owned rejection to degraded success without identity or claim", async () => {
    await withPiSessionStartCliRejectionMappingEvidence((evidence) => {
      expect(evidence.hookResult.exitCode, evidence.hookResult.stderr).toBe(0);
      expect(evidence.hookResult.stdout).toHaveLength(0);
      expect(evidence.hookResult.stderr).toContain(
        PI_SESSION_START_REJECTION_REGISTRY[evidence.rejectionKind].diagnostic,
      );
      expect(evidence.envContent).not.toContain(
        `${HOOK_ENV_FILE.EXPORT_PREFIX}${HOOK_SESSION_START_ENV.CLAUDE_SESSION_ID}=`,
      );
      expect(evidence.statusResult.exitCode, evidence.statusResult.stderr).toBe(0);
      expect(JSON.parse(evidence.statusResult.stdout)).toEqual(
        expect.objectContaining({ status: OCCUPANCY_STATUS.FREE }),
      );
    });
  });
});
