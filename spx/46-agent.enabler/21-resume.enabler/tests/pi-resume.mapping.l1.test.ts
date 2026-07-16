import { describe, expect, it } from "vitest";

import {
  withPiBranchCliScopeEvidence,
  withPiLaunchMappingEvidence,
  withPiScopeMappingEvidence,
} from "@testing/harnesses/agent/pi-resume";

describe("Pi resume mappings", () => {
  it("maps worktree scope to Pi inclusion and branch scope to branchless Pi exclusion", async () => {
    await withPiScopeMappingEvidence((evidence) => {
      expect(evidence.actualRows).toEqual(evidence.expectedRows);
    });
  });

  it("maps the CLI branch flag to output that excludes branchless Pi sessions", async () => {
    await withPiBranchCliScopeEvidence((evidence) => {
      expect(evidence.output).toContain(evidence.includedSessionId);
      expect(evidence.excludedSessionIds.every((sessionId) => !evidence.output.includes(sessionId))).toBe(true);
    });
  });

  it("maps a Pi candidate to the native exact-source launch command", () => {
    withPiLaunchMappingEvidence((evidence) => {
      expect(evidence.actual).toEqual(evidence.expected);
    });
  });
});
