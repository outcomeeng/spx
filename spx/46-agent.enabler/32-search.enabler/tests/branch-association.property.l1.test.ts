import { describe, it } from "vitest";

import { agentHomeDirsFromHomeDir } from "@/domains/agent/home";
import { AGENT_SEARCH_MATCH_REASON } from "@/domains/agent/protocol";
import { agentSearchQueryFromOptions, searchAgentSessions } from "@/domains/agent/search";

import { arbitraryMovingSessionBranchScenario } from "@testing/generators/agent/search";
import { MemoryAgentSessionFileSystem, writeClaudeMultiRecordTranscriptFile } from "@testing/harnesses/agent/resume";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("agent search — branch association over a session's recorded history", () => {
  it("returns a session for a branch its transcript records at any position", async () => {
    await assertProperty(
      arbitraryMovingSessionBranchScenario(),
      async (scenario): Promise<boolean> => {
        const fs = new MemoryAgentSessionFileSystem();
        writeClaudeMultiRecordTranscriptFile(fs, scenario.homeDir, {
          sessionId: scenario.sessionId,
          records: scenario.records,
          modifiedAtMs: scenario.nowMs,
        });

        const results = await searchAgentSessions({
          agentHomeDirs: agentHomeDirsFromHomeDir(scenario.homeDir),
          nowMs: scenario.nowMs,
          productScopeRoot: scenario.productScopeRoot,
          branchAssociatedWorktreeRoots: [],
          fs,
          query: agentSearchQueryFromOptions({ branch: scenario.targetBranch }),
        });

        const [result] = results;
        return results.length === 1
          && result !== undefined
          && result.sessionId === scenario.sessionId
          && result.cwd === scenario.branchRecordCwd
          && result.matches.includes(AGENT_SEARCH_MATCH_REASON.BRANCH);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
