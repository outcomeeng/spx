import { describe, expect, it } from "vitest";

import {
  withPiBranchScopeEvidence,
  withPiInteractiveLaunchEvidence,
  withPiWorktreeScopeEvidence,
} from "@testing/harnesses/agent/pi-resume";
import { ImmediateExit } from "@testing/harnesses/agent/resume";

describe("Pi resume scenarios", () => {
  it("includes Codex, Claude Code, and Pi sessions from the invocation worktree", async () => {
    await withPiWorktreeScopeEvidence((evidence) => {
      expect(evidence.actualCandidates).toEqual(evidence.expectedCandidates);
    });
  });

  it("excludes branchless Pi sessions from explicit branch scope", async () => {
    await withPiBranchScopeEvidence((evidence) => {
      expect(evidence.actualSessionIds).toEqual(evidence.expectedSessionIds);
    });
  });

  it("selects Pi from mixed candidates and launches its native exact-source command", async () => {
    await withPiInteractiveLaunchEvidence((evidence) => {
      expect(evidence.parseError).toBeInstanceOf(ImmediateExit);
      expect(evidence.launchedCandidates).toEqual(evidence.expectedLaunchedCandidates);
      expect(evidence.commands).toEqual(evidence.expectedCommands);
      expect(evidence.args).toEqual(evidence.expectedArgs);
      expect(evidence.cwd).toBe(evidence.expectedCwd);
      expect(evidence.stdio).toEqual(evidence.expectedStdio);
      expect(evidence.restoreCount).toBe(evidence.expectedRestoreCount);
      expect(evidence.exitCodes).toEqual(evidence.expectedExitCodes);
    });
  });
});
