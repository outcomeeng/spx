import { describe, expect, it } from "vitest";

import { HOOK_ENV_FILE, HOOK_SESSION_START_ENV } from "@/domains/hooks/session-start";
import { OCCUPANCY_STATUS } from "@/domains/worktree/occupancy-store";
import {
  withAbsentPiTranscriptPathCliEvidence,
  withMalformedPiTranscriptHeaderCliEvidence,
  withMismatchedPiTranscriptProductCliEvidence,
  withUnreadablePiTranscriptPathCliEvidence,
} from "@testing/harnesses/hooks/session-start";

describe("packaged hook session-start Pi rejection mapping", () => {
  it("degrades without identity or claim when the exact transcript path is absent", async () => {
    await withAbsentPiTranscriptPathCliEvidence((evidence) => {
      expect(evidence.hookResult.exitCode, evidence.hookResult.stderr).toBe(0);
      expect(evidence.hookResult.stdout).toHaveLength(0);
      expect(evidence.hookResult.stderr).toContain(evidence.diagnostic);
      expect(evidence.envContent).not.toContain(
        `${HOOK_ENV_FILE.EXPORT_PREFIX}${HOOK_SESSION_START_ENV.CLAUDE_SESSION_ID}=`,
      );
      expect(evidence.statusResult.exitCode, evidence.statusResult.stderr).toBe(0);
      expect(JSON.parse(evidence.statusResult.stdout)).toEqual(
        expect.objectContaining({ status: OCCUPANCY_STATUS.FREE }),
      );
    });
  });

  it("degrades without identity or claim when the exact transcript path is unreadable", async () => {
    await withUnreadablePiTranscriptPathCliEvidence((evidence) => {
      expect(evidence.hookResult.exitCode, evidence.hookResult.stderr).toBe(0);
      expect(evidence.hookResult.stdout).toHaveLength(0);
      expect(evidence.hookResult.stderr).toContain(evidence.diagnostic);
      expect(evidence.envContent).not.toContain(
        `${HOOK_ENV_FILE.EXPORT_PREFIX}${HOOK_SESSION_START_ENV.CLAUDE_SESSION_ID}=`,
      );
      expect(evidence.statusResult.exitCode, evidence.statusResult.stderr).toBe(0);
      expect(JSON.parse(evidence.statusResult.stdout)).toEqual(
        expect.objectContaining({ status: OCCUPANCY_STATUS.FREE }),
      );
    });
  });

  it("degrades without identity or claim when the Pi transcript header is malformed", async () => {
    await withMalformedPiTranscriptHeaderCliEvidence((evidence) => {
      expect(evidence.hookResult.exitCode, evidence.hookResult.stderr).toBe(0);
      expect(evidence.hookResult.stdout).toHaveLength(0);
      expect(evidence.hookResult.stderr).toContain(evidence.diagnostic);
      expect(evidence.envContent).not.toContain(
        `${HOOK_ENV_FILE.EXPORT_PREFIX}${HOOK_SESSION_START_ENV.CLAUDE_SESSION_ID}=`,
      );
      expect(evidence.statusResult.exitCode, evidence.statusResult.stderr).toBe(0);
      expect(JSON.parse(evidence.statusResult.stdout)).toEqual(
        expect.objectContaining({ status: OCCUPANCY_STATUS.FREE }),
      );
    });
  });

  it("degrades without identity or claim when the Pi transcript product directory differs", async () => {
    await withMismatchedPiTranscriptProductCliEvidence((evidence) => {
      expect(evidence.hookResult.exitCode, evidence.hookResult.stderr).toBe(0);
      expect(evidence.hookResult.stdout).toHaveLength(0);
      expect(evidence.hookResult.stderr).toContain(evidence.diagnostic);
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
