import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { agentHomeDirsFromHomeDir } from "@/domains/agent/home";
import { AGENT_RESUME_COMMAND, AGENT_RESUME_LIMITS, AGENT_SESSION_STORE } from "@/domains/agent/protocol";
import {
  withConfiguredAgentHomeDiscoveryEvidence,
  withDefaultAgentSessionStoreEvidence,
  withPiAgentDirectoryEvidence,
  withPiSessionDirectoryEvidence,
} from "@testing/harnesses/agent/home";
import {
  withPiBranchScopeEvidence,
  withPiPerAgentCapEvidence,
  withPiSessionHeaderEvidence,
  withPiSinceEvidence,
  withPiUnknownActivityEvidence,
} from "@testing/harnesses/agent/pi-resume";

describe("Pi resume compliance", () => {
  it("applies the per-agent cap and total candidate bound to Pi sessions", async () => {
    await withPiPerAgentCapEvidence((evidence) => {
      expect(evidence.codexSessionIds).toEqual(
        evidence.codexInputSessionIds.slice(0, AGENT_RESUME_LIMITS.PER_AGENT_DISPLAYED_CANDIDATES),
      );
      expect(evidence.claudeSessionIds).toEqual(
        evidence.claudeInputSessionIds.slice(0, AGENT_RESUME_LIMITS.PER_AGENT_DISPLAYED_CANDIDATES),
      );
      expect(evidence.piSessionIds).toEqual(
        evidence.piInputSessionIds.slice(0, AGENT_RESUME_LIMITS.PER_AGENT_DISPLAYED_CANDIDATES),
      );
      expect(evidence.totalCandidateCount).toBe(AGENT_RESUME_LIMITS.TOTAL_DISPLAYED_CANDIDATES);
      expect(evidence.overTotalCapInputCount).toBeGreaterThan(AGENT_RESUME_LIMITS.TOTAL_DISPLAYED_CANDIDATES);
      expect(evidence.totalBoundedCandidateCount).toBe(AGENT_RESUME_LIMITS.TOTAL_DISPLAYED_CANDIDATES);
    });
  });

  it("fills default-window Pi slots with unknown activity after timestamped sessions", async () => {
    await withPiUnknownActivityEvidence((evidence) => {
      expect(evidence.actualRows).toEqual([
        [evidence.timestampedSessionId, expect.any(Number)],
        [evidence.unknownSessionId, null],
      ]);
    });
  });

  it("uses bounded Pi tail activity for explicit activity windows", async () => {
    await withPiSinceEvidence((evidence) => {
      expect(evidence.actualSessionIds).toContain(evidence.recentSessionId);
      expect(evidence.actualSessionIds).not.toContain(evidence.staleSessionId);
      expect(evidence.actualSessionIds).not.toContain(evidence.unknownSessionId);
      expect(evidence.actualActivityAtMs).toBe(evidence.recentActivityAtMs);
      expect(evidence.maxTailReadBytes).toBe(AGENT_RESUME_LIMITS.ACTIVITY_TAIL_BYTES);
    });
  });

  it("accepts a versioned opening session row and launches the exact source path", async () => {
    await withPiSessionHeaderEvidence((evidence) => {
      expect(evidence.discoveredSessionIds).toEqual([evidence.validSessionId]);
      expect(evidence.launchCommand).toEqual({
        command: AGENT_RESUME_COMMAND.PI_BINARY,
        args: [AGENT_RESUME_COMMAND.PI_SESSION, evidence.sourcePath],
        cwd: evidence.cwd,
      });
    });
  });

  it("resolves the default stores and discovers all three agent kinds", async () => {
    await withDefaultAgentSessionStoreEvidence((evidence) => {
      expect(evidence.resolvedHomeDirs).toEqual(agentHomeDirsFromHomeDir(evidence.homeDir));
      expect(evidence.resumeOutput).toContain(evidence.codexSessionId);
      expect(evidence.resumeOutput).toContain(evidence.claudeSessionId);
      expect(evidence.resumeOutput).toContain(evidence.piSessionId);
    });
  });

  it("resolves PI_CODING_AGENT_DIR sessions before the default Pi store", async () => {
    await withPiAgentDirectoryEvidence((evidence) => {
      expect(evidence.resolved).toEqual({
        ...agentHomeDirsFromHomeDir(evidence.defaultHome),
        piAgent: evidence.piAgentHome,
        piSessions: join(evidence.piAgentHome, AGENT_SESSION_STORE.PI_SESSIONS_DIR),
      });
      expect(evidence.resumeOutput).toContain(evidence.configuredSessionId);
      expect(evidence.resumeOutput).not.toContain(evidence.defaultSessionId);
      expect(evidence.defaultResumeOutput).toContain(evidence.defaultSessionId);
      expect(evidence.defaultResumeOutput).not.toContain(evidence.configuredSessionId);
    });
  });

  it("discovers sessions from PI_CODING_AGENT_SESSION_DIR alone", async () => {
    await withPiSessionDirectoryEvidence((evidence) => {
      expect(evidence.resolved).toEqual({
        ...agentHomeDirsFromHomeDir(evidence.defaultHome),
        piSessions: evidence.piSessionHome,
      });
      expect(evidence.resumeOutput).toContain(evidence.sessionId);
    });
  });

  it("skips the Pi store entirely for branch-scoped discovery", async () => {
    await withPiBranchScopeEvidence((evidence) => {
      expect(evidence.piStoreWasRead).toBe(false);
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
      expect(evidence.defaultResumeOutput).toContain(evidence.defaultCodexSessionId);
      expect(evidence.defaultResumeOutput).toContain(evidence.defaultClaudeSessionId);
      expect(evidence.defaultResumeOutput).toContain(evidence.defaultPiSessionId);
      expect(evidence.defaultResumeOutput).not.toContain(evidence.configuredCodexSessionId);
      expect(evidence.defaultResumeOutput).not.toContain(evidence.configuredClaudeSessionId);
      expect(evidence.defaultResumeOutput).not.toContain(evidence.configuredPiSessionId);
    });
  });
});
