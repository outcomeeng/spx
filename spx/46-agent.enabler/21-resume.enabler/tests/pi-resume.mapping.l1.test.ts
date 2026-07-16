import { describe, expect, it } from "vitest";

import { AGENT_RESUME_COMMAND } from "@/domains/agent/protocol";
import {
  withAllAgentLaunchMappingEvidence,
  withPiBranchCliScopeEvidence,
  withPiScopeMappingEvidence,
} from "@testing/harnesses/agent/pi-resume";

describe("Pi resume mappings", () => {
  it("maps worktree scope to Pi inclusion and branch scope to branchless Pi exclusion", async () => {
    await withPiScopeMappingEvidence((evidence) => {
      expect(evidence.actualRows).toEqual([
        [evidence.worktreeOnTarget, evidence.worktreeOnOther, evidence.claudeInWorktree, evidence.piInWorktree],
        [evidence.worktreeOnTarget, evidence.siblingOnTarget],
      ]);
    });
  });

  it("maps the CLI branch flag to output that excludes branchless Pi sessions", async () => {
    await withPiBranchCliScopeEvidence((evidence) => {
      expect(evidence.output).toContain(evidence.includedSessionId);
      expect(evidence.excludedSessionIds.every((sessionId) => !evidence.output.includes(sessionId))).toBe(true);
    });
  });

  it("maps every agent candidate to its native launch command and recorded working directory", () => {
    withAllAgentLaunchMappingEvidence((evidence) => {
      expect(evidence.codex.actual).toEqual({
        command: AGENT_RESUME_COMMAND.CODEX_BINARY,
        args: [AGENT_RESUME_COMMAND.CODEX_RESUME, evidence.codex.candidate.sessionId],
        cwd: evidence.codex.candidate.cwd,
      });
      expect(evidence.claudeCode.actual).toEqual({
        command: AGENT_RESUME_COMMAND.CLAUDE_BINARY,
        args: [AGENT_RESUME_COMMAND.CLAUDE_RESUME, evidence.claudeCode.candidate.sessionId],
        cwd: evidence.claudeCode.candidate.cwd,
      });
      expect(evidence.pi.actual).toEqual({
        command: AGENT_RESUME_COMMAND.PI_BINARY,
        args: [AGENT_RESUME_COMMAND.PI_SESSION, evidence.pi.candidate.sourcePath],
        cwd: evidence.pi.candidate.cwd,
      });
    });
  });
});
