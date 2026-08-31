import { describe, it } from "vitest";

import { agentHomeDirsFromHomeDir } from "@/domains/agent/home";
import { AGENT_RESUME_SCOPE } from "@/domains/agent/protocol";
import { discoverAgentResumeCandidates } from "@/domains/agent/resume";
import { agentSearchQueryFromOptions, searchAgentSessions } from "@/domains/agent/search";

import { arbitraryBetweenReachWindowsScenario, arbitrarySinceWindowScenario } from "@testing/generators/agent/search";
import {
  agentResumeWorktreeRootResolver,
  MemoryAgentSessionFileSystem,
  writeClaudeProjectTranscriptFile,
} from "@testing/harnesses/agent/resume";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("agent search — reach window", () => {
  it("admits exactly the sessions whose activity falls within the requested since duration", async () => {
    await assertProperty(
      arbitrarySinceWindowScenario(),
      async (scenario): Promise<boolean> => {
        const fs = new MemoryAgentSessionFileSystem();
        writeClaudeProjectTranscriptFile(fs, scenario.homeDir, {
          sessionId: scenario.insideSessionId,
          cwd: scenario.insideCwd,
          timestamp: new Date(scenario.insideModifiedAtMs).toISOString(),
          branch: scenario.branch,
          modifiedAtMs: scenario.insideModifiedAtMs,
        });
        writeClaudeProjectTranscriptFile(fs, scenario.homeDir, {
          sessionId: scenario.outsideSessionId,
          cwd: scenario.outsideCwd,
          timestamp: new Date(scenario.outsideModifiedAtMs).toISOString(),
          branch: scenario.branch,
          modifiedAtMs: scenario.outsideModifiedAtMs,
        });

        const results = await searchAgentSessions({
          agentHomeDirs: agentHomeDirsFromHomeDir(scenario.homeDir),
          nowMs: scenario.nowMs,
          productScopeRoot: scenario.productScopeRoot,
          branchAssociatedWorktreeRoots: [],
          fs,
          query: agentSearchQueryFromOptions({ branch: scenario.branch, sinceMs: scenario.sinceMs }),
        });

        return results.map((result) => result.sessionId).join() === scenario.insideSessionId;
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("applies its own default reach window rather than the window resume applies", async () => {
    await assertProperty(
      arbitraryBetweenReachWindowsScenario(),
      async (scenario): Promise<boolean> => {
        const fs = new MemoryAgentSessionFileSystem();
        writeClaudeProjectTranscriptFile(fs, scenario.homeDir, {
          sessionId: scenario.sessionId,
          cwd: scenario.cwd,
          timestamp: new Date(scenario.modifiedAtMs).toISOString(),
          branch: scenario.branch,
          modifiedAtMs: scenario.modifiedAtMs,
        });

        const searched = await searchAgentSessions({
          agentHomeDirs: agentHomeDirsFromHomeDir(scenario.homeDir),
          nowMs: scenario.nowMs,
          productScopeRoot: scenario.productScopeRoot,
          branchAssociatedWorktreeRoots: [],
          fs,
          query: agentSearchQueryFromOptions({ branch: scenario.branch }),
        });
        const resumable = await discoverAgentResumeCandidates({
          invocationDir: scenario.cwd,
          agentHomeDirs: agentHomeDirsFromHomeDir(scenario.homeDir),
          nowMs: scenario.nowMs,
          scope: { kind: AGENT_RESUME_SCOPE.BRANCH, branch: scenario.branch },
          fs,
          resolveWorktreeRoot: agentResumeWorktreeRootResolver(scenario.productScopeRoot),
        });

        return searched.map((result) => result.sessionId).join() === scenario.sessionId
          && resumable.every((candidate) => candidate.sessionId !== scenario.sessionId);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
