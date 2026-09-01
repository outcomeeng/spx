import { describe, expect, it } from "vitest";

import { AGENT_RESUME_LIMITS } from "@/domains/agent/protocol";
import { withCodexRecordWindowEvidence } from "@testing/harnesses/agent/record-scope";

describe("Codex record-window compliance", () => {
  it("never reads beyond the fixed head and tail windows, so a record between them does not classify the session", async () => {
    await withCodexRecordWindowEvidence((evidence) => {
      expect(evidence.candidateSessionIds).not.toContain(evidence.midWindowSessionId);
      expect(evidence.maxHeadReadBytes).toBeLessThanOrEqual(AGENT_RESUME_LIMITS.METADATA_HEAD_BYTES);
      expect(evidence.maxTailReadBytes).toBeLessThanOrEqual(AGENT_RESUME_LIMITS.ACTIVITY_TAIL_BYTES);
    });
  });

  it("includes a session by its opening working directory when every record lies outside the invocation worktree, and excludes one with neither in scope", async () => {
    await withCodexRecordWindowEvidence((evidence) => {
      expect(evidence.candidateSessionIds).toContain(evidence.fallbackSessionId);
      expect(evidence.candidateCwds.get(evidence.fallbackSessionId)).toBe(evidence.fallbackOpeningCwd);
      expect(evidence.candidateSessionIds).not.toContain(evidence.outsideSessionId);
    });
  });
});
