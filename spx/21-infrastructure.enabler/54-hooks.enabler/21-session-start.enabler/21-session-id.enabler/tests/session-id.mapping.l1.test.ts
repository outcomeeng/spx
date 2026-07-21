import { describe, expect, it } from "vitest";

import { PI_SESSION_START_REJECTION_KINDS, PI_SESSION_START_REJECTION_REGISTRY } from "@/domains/hooks/session-start";
import { withPiSessionStartRejectionMappingEvidence } from "@testing/harnesses/hooks/session-start";

describe("hook session-start Pi identity rejection mapping", () => {
  it.each(PI_SESSION_START_REJECTION_KINDS)(
    "maps $rejectionKind to no identity or claim",
    async (rejectionKind) => {
      await withPiSessionStartRejectionMappingEvidence(rejectionKind, (evidence) => {
        expect(evidence.result.ok).toBe(true);
        if (!evidence.result.ok) throw new Error(evidence.result.error);
        expect(evidence.result.value.sessionId).toBeUndefined();
        expect(evidence.result.value.claimed).toBe(false);
        expect(evidence.result.value.diagnostics).toContainEqual(
          expect.stringContaining(PI_SESSION_START_REJECTION_REGISTRY[evidence.rejectionKind].diagnostic),
        );
      });
    },
  );
});
