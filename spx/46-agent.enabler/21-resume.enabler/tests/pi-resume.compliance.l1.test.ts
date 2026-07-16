import { describe, expect, it } from "vitest";

import {
  withConfiguredAgentHomeDiscoveryEvidence,
  withDefaultAgentSessionStoreEvidence,
  withPiAgentDirectoryEvidence,
  withPiPerAgentCapEvidence,
  withPiSessionHeaderEvidence,
} from "@testing/harnesses/agent/resume";

describe("Pi resume compliance", () => {
  it("applies the per-agent cap and total candidate bound to Pi sessions", async () => {
    await withPiPerAgentCapEvidence((evidence) => {
      expect(evidence.codexSessionIds).toEqual(evidence.expectedCodexSessionIds);
      expect(evidence.claudeSessionIds).toEqual(evidence.expectedClaudeSessionIds);
      expect(evidence.piSessionIds).toEqual(evidence.expectedPiSessionIds);
      expect(evidence.totalCandidateCount).toBe(evidence.expectedTotalCandidateCount);
    });
  });

  it("accepts a versioned opening session row and launches the exact source path", async () => {
    await withPiSessionHeaderEvidence((evidence) => {
      expect(evidence.discoveredSessionIds).toEqual(evidence.expectedSessionIds);
      expect(evidence.launchCommand).toEqual(evidence.expectedLaunchCommand);
    });
  });

  it("resolves the default stores and discovers all three agent kinds", async () => {
    await withDefaultAgentSessionStoreEvidence((evidence) => {
      expect(evidence.resolvedHomeDirs).toEqual(evidence.expectedHomeDirs);
      expect(evidence.resumeOutput).toContain(evidence.codexSessionId);
      expect(evidence.resumeOutput).toContain(evidence.claudeSessionId);
      expect(evidence.resumeOutput).toContain(evidence.piSessionId);
    });
  });

  it("resolves PI_CODING_AGENT_DIR sessions before the default Pi store", async () => {
    await withPiAgentDirectoryEvidence((evidence) => {
      expect(evidence.resolved).toEqual(evidence.expected);
      expect(evidence.resumeOutput).toContain(evidence.configuredSessionId);
      expect(evidence.resumeOutput).not.toContain(evidence.defaultSessionId);
    });
  });

  it("uses configured stores for all three agent kinds and excludes their defaults", async () => {
    await withConfiguredAgentHomeDiscoveryEvidence((evidence) => {
      expect(evidence.resumeOutput).toContain(evidence.configuredCodexSessionId);
      expect(evidence.resumeOutput).toContain(evidence.configuredClaudeSessionId);
      expect(evidence.resumeOutput).toContain(evidence.configuredPiSessionId);
      expect(evidence.resumeOutput).not.toContain(evidence.defaultCodexSessionId);
      expect(evidence.resumeOutput).not.toContain(evidence.defaultClaudeSessionId);
      expect(evidence.resumeOutput).not.toContain(evidence.defaultPiSessionId);
    });
  });
});
