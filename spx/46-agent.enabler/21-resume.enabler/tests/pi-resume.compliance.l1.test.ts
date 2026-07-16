import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { agentHomeDirsFromHomeDir } from "@/domains/agent/home";
import {
  AGENT_RESUME_COMMAND,
  AGENT_RESUME_LIMITS,
  AGENT_SESSION_KIND,
  AGENT_SESSION_STORE,
} from "@/domains/agent/protocol";
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
      expect(evidence.codexSessionIds).toEqual(
        evidence.codexInputSessionIds.slice(0, AGENT_RESUME_LIMITS.PER_AGENT_DISPLAYED_CANDIDATES),
      );
      expect(evidence.claudeSessionIds).toEqual(
        evidence.claudeInputSessionIds.slice(0, AGENT_RESUME_LIMITS.PER_AGENT_DISPLAYED_CANDIDATES),
      );
      expect(evidence.piSessionIds).toEqual(
        evidence.piInputSessionIds.slice(0, AGENT_RESUME_LIMITS.PER_AGENT_DISPLAYED_CANDIDATES),
      );
      expect(evidence.totalCandidateCount).toBe(
        AGENT_RESUME_LIMITS.PER_AGENT_DISPLAYED_CANDIDATES * Object.values(AGENT_SESSION_KIND).length,
      );
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
