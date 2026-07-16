import { describe, expect, it } from "vitest";

import {
  withAgentHomeResolutionEvidence,
  withConfiguredAgentHomeDiscoveryEvidence,
  withPiAgentDirectoryEvidence,
} from "@testing/harnesses/agent/resume";

describe("agent home resolution compliance", () => {
  it("resolves configured Codex, Claude Code, and Pi homes before default homes", () => {
    withAgentHomeResolutionEvidence((evidence) => {
      expect(evidence.configured).toEqual(evidence.configuredExpected);
    });
  });

  it("resolves default Codex, Claude Code, and Pi homes when no configured homes exist", () => {
    withAgentHomeResolutionEvidence((evidence) => {
      expect(evidence.defaults).toEqual(evidence.defaultsExpected);
    });
  });

  it("resolves Pi sessions under PI_CODING_AGENT_DIR and carries that path into discovery", async () => {
    await withPiAgentDirectoryEvidence((evidence) => {
      expect(evidence.resolved).toEqual(evidence.expected);
      expect(evidence.resumeOutput).toContain(evidence.configuredSessionId);
      expect(evidence.resumeOutput).not.toContain(evidence.defaultSessionId);
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
    });
  });

  it("uses Codex and Claude Code homes without adding Pi sessions to search discovery", async () => {
    await withConfiguredAgentHomeDiscoveryEvidence((evidence) => {
      expect(evidence.configuredSearchOutput).toContain(evidence.configuredCodexSessionId);
      expect(evidence.configuredSearchOutput).toContain(evidence.configuredClaudeSessionId);
      expect(evidence.configuredSearchOutput).not.toContain(evidence.defaultCodexSessionId);
      expect(evidence.configuredSearchOutput).not.toContain(evidence.defaultClaudeSessionId);
      expect(evidence.configuredSearchOutput).not.toContain(evidence.configuredPiSessionId);
      expect(evidence.configuredSearchOutput).not.toContain(evidence.defaultPiSessionId);
      expect(evidence.defaultSearchOutput).toContain(evidence.defaultCodexSessionId);
      expect(evidence.defaultSearchOutput).toContain(evidence.defaultClaudeSessionId);
      expect(evidence.defaultSearchOutput).not.toContain(evidence.configuredCodexSessionId);
      expect(evidence.defaultSearchOutput).not.toContain(evidence.configuredClaudeSessionId);
      expect(evidence.defaultSearchOutput).not.toContain(evidence.configuredPiSessionId);
      expect(evidence.defaultSearchOutput).not.toContain(evidence.defaultPiSessionId);
    });
  });
});
