import { describe, expect, it } from "vitest";

import { PI_SESSION_START_REJECTION_REGISTRY } from "@/domains/hooks/session-start";
import { withUntrustedPiTranscriptPathEvidence } from "@testing/harnesses/hooks/session-start";

describe("hook session-start Pi transcript provenance", () => {
  it("never reads transcript metadata through a canonical store escape", async () => {
    await withUntrustedPiTranscriptPathEvidence((evidence) => {
      expect(evidence.result.ok).toBe(true);
      if (!evidence.result.ok) throw new Error(evidence.result.error);
      expect(evidence.transcriptPathsRead).toHaveLength(0);
      expect(evidence.result.value.sessionId).toBeUndefined();
      expect(evidence.result.value.claimed).toBe(false);
      expect(evidence.result.value.diagnostics).toContain(
        PI_SESSION_START_REJECTION_REGISTRY.pathUntrusted.diagnostic,
      );
    });
  });
});
