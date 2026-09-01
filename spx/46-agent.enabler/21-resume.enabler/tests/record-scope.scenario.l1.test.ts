import { describe, expect, it } from "vitest";

import { withCodexForkedRecordScopeEvidence } from "@testing/harnesses/agent/record-scope";

describe("Codex forked-session record scope", () => {
  it("includes a session whose opening metadata lies outside the worktree when a bounded-window record resolves inside it, resolving the newest in-scope record", async () => {
    await withCodexForkedRecordScopeEvidence((evidence) => {
      expect(evidence.candidateSessionIds).toContain(evidence.forkSessionId);
      expect(evidence.candidateSessionIds).not.toContain(evidence.outsideSessionId);
      expect(evidence.candidateCwds.get(evidence.forkSessionId)).toBe(evidence.newestInScopeRecordCwd);
      expect(evidence.launchCwds.get(evidence.forkSessionId)).toBe(evidence.newestInScopeRecordCwd);
    });
  });
});
