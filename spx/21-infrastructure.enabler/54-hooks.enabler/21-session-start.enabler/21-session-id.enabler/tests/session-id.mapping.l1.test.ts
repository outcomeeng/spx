import { describe, expect, it } from "vitest";

import {
  withAbsentPiTranscriptPathEvidence,
  withMalformedPiTranscriptHeaderEvidence,
  withMismatchedPiTranscriptProductEvidence,
  withUnreadablePiTranscriptPathEvidence,
} from "@testing/harnesses/hooks/session-start";

describe("hook session-start Pi identity rejection mapping", () => {
  it("rejects an absent exact transcript path", async () => {
    await withAbsentPiTranscriptPathEvidence((evidence) => {
      expect(evidence.result.ok).toBe(true);
      if (!evidence.result.ok) throw new Error(evidence.result.error);
      expect(evidence.result.value.sessionId).toBeUndefined();
      expect(evidence.result.value.claimed).toBe(false);
      expect(evidence.result.value.diagnostics).toContain(evidence.diagnostic);
    });
  });

  it("rejects an unreadable exact transcript path", async () => {
    await withUnreadablePiTranscriptPathEvidence((evidence) => {
      expect(evidence.result.ok).toBe(true);
      if (!evidence.result.ok) throw new Error(evidence.result.error);
      expect(evidence.result.value.sessionId).toBeUndefined();
      expect(evidence.result.value.claimed).toBe(false);
      expect(evidence.result.value.diagnostics).toContainEqual(expect.stringContaining(evidence.diagnostic));
    });
  });

  it("rejects a malformed Pi transcript header", async () => {
    await withMalformedPiTranscriptHeaderEvidence((evidence) => {
      expect(evidence.result.ok).toBe(true);
      if (!evidence.result.ok) throw new Error(evidence.result.error);
      expect(evidence.result.value.sessionId).toBeUndefined();
      expect(evidence.result.value.claimed).toBe(false);
      expect(evidence.result.value.diagnostics).toContain(evidence.diagnostic);
    });
  });

  it("rejects a Pi transcript for a different product directory", async () => {
    await withMismatchedPiTranscriptProductEvidence((evidence) => {
      expect(evidence.result.ok).toBe(true);
      if (!evidence.result.ok) throw new Error(evidence.result.error);
      expect(evidence.result.value.sessionId).toBeUndefined();
      expect(evidence.result.value.claimed).toBe(false);
      expect(evidence.result.value.diagnostics).toContain(evidence.diagnostic);
    });
  });
});
