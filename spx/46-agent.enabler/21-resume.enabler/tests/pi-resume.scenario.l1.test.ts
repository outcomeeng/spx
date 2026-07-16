import { describe, expect, it } from "vitest";

import { AGENT_RESUME_COMMAND, AGENT_SESSION_KIND } from "@/domains/agent/protocol";
import { FOREGROUND_LAUNCH_STDIO } from "@/interfaces/cli/foreground-launch";
import {
  withPiBranchScopeEvidence,
  withPiInteractiveLaunchEvidence,
  withPiWorktreeScopeEvidence,
} from "@testing/harnesses/agent/pi-resume";
import { ImmediateExit } from "@testing/harnesses/agent/resume";

describe("Pi resume scenarios", () => {
  it("includes Codex, Claude Code, and Pi sessions from the invocation worktree", async () => {
    await withPiWorktreeScopeEvidence((evidence) => {
      expect(evidence.actualCandidates).toEqual([
        [AGENT_SESSION_KIND.CODEX, evidence.codexSessionId],
        [AGENT_SESSION_KIND.CLAUDE_CODE, evidence.claudeSessionId],
        [AGENT_SESSION_KIND.PI, evidence.piSessionId],
      ]);
    });
  });

  it("excludes branchless Pi sessions from explicit branch scope", async () => {
    await withPiBranchScopeEvidence((evidence) => {
      expect(evidence.actualSessionIds).toEqual([evidence.codexSessionId, evidence.claudeSessionId]);
    });
  });

  it("selects Pi from mixed candidates and launches its native exact-source command", async () => {
    await withPiInteractiveLaunchEvidence((evidence) => {
      expect(evidence.parseError).toBeInstanceOf(ImmediateExit);
      expect(evidence.launchedCandidates).toEqual([
        [AGENT_SESSION_KIND.PI, evidence.piSessionId, evidence.piSourcePath],
      ]);
      expect(evidence.commands).toEqual([AGENT_RESUME_COMMAND.PI_BINARY]);
      expect(evidence.args).toEqual([[AGENT_RESUME_COMMAND.PI_SESSION, evidence.piSourcePath]]);
      expect(evidence.cwd).toBe(evidence.piCwd);
      expect(evidence.stdio).toEqual(FOREGROUND_LAUNCH_STDIO);
      expect(evidence.restoreCount).toBe(1);
      expect(evidence.exitCodes).toEqual([evidence.launchExitCode]);
    });
  });
});
