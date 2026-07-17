import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { agentHomeDirsFromHomeDir } from "@/domains/agent/home";
import { AGENT_SESSION_STORE } from "@/domains/agent/protocol";
import {
  withAgentHomeResolutionEvidence,
  withConfiguredAgentHomeDiscoveryEvidence,
  withPiAgentDirectoryEvidence,
  withPiSessionDirectoryEvidence,
} from "@testing/harnesses/agent/home";

describe("agent home resolution compliance", () => {
  it("resolves configured Codex, Claude Code, and Pi homes before default homes", () => {
    withAgentHomeResolutionEvidence((evidence) => {
      expect(evidence.configured).toEqual(evidence.configuredInputs);
    });
  });

  it("resolves default Codex, Claude Code, and Pi homes when no configured homes exist", () => {
    withAgentHomeResolutionEvidence((evidence) => {
      expect(evidence.defaults).toEqual(agentHomeDirsFromHomeDir(evidence.defaultHome));
    });
  });

  it("resolves Pi sessions under PI_CODING_AGENT_DIR and carries that path into discovery", async () => {
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

  it("coordinates a standalone PI_CODING_AGENT_SESSION_DIR override", async () => {
    await withPiSessionDirectoryEvidence((evidence) => {
      expect(evidence.resolved).toEqual({
        ...agentHomeDirsFromHomeDir(evidence.defaultHome),
        piSessions: evidence.piSessionHome,
      });
      expect(evidence.resumeOutput).toContain(evidence.sessionId);
    });
  });

  it("uses configured Codex, Claude Code, and Pi homes for resume discovery", async () => {
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

  it("uses configured Codex, Claude Code, and Pi homes for search discovery", async () => {
    await withConfiguredAgentHomeDiscoveryEvidence((evidence) => {
      expect(evidence.configuredSearchOutput).toContain(evidence.configuredCodexSessionId);
      expect(evidence.configuredSearchOutput).toContain(evidence.configuredClaudeSessionId);
      expect(evidence.configuredSearchOutput).toContain(evidence.configuredPiSessionId);
      expect(evidence.configuredSearchOutput).not.toContain(evidence.defaultCodexSessionId);
      expect(evidence.configuredSearchOutput).not.toContain(evidence.defaultClaudeSessionId);
      expect(evidence.configuredSearchOutput).not.toContain(evidence.defaultPiSessionId);
      expect(evidence.defaultSearchOutput).toContain(evidence.defaultCodexSessionId);
      expect(evidence.defaultSearchOutput).toContain(evidence.defaultClaudeSessionId);
      expect(evidence.defaultSearchOutput).toContain(evidence.defaultPiSessionId);
      expect(evidence.defaultSearchOutput).not.toContain(evidence.configuredCodexSessionId);
      expect(evidence.defaultSearchOutput).not.toContain(evidence.configuredClaudeSessionId);
      expect(evidence.defaultSearchOutput).not.toContain(evidence.configuredPiSessionId);
    });
  });
});
