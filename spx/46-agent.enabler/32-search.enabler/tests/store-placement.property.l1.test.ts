import { describe, it } from "vitest";

import { agentHomeDirsFromHomeDir } from "@/domains/agent/home";
import { AGENT_SEARCH_MATCH_REASON } from "@/domains/agent/protocol";
import { agentSearchQueryFromOptions, searchAgentSessions } from "@/domains/agent/search";

import { arbitraryMovingSessionBranchScenario } from "@testing/generators/agent/search";
import { MemoryAgentSessionFileSystem, writeClaudeMultiRecordTranscriptFile } from "@testing/harnesses/agent/resume";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("agent search — store-directory placement", () => {
  it("returns a session for a content selector whichever store directory holds its transcript", async () => {
    await assertProperty(
      arbitraryMovingSessionBranchScenario(),
      async (scenario): Promise<boolean> => {
        const fs = new MemoryAgentSessionFileSystem();
        writeClaudeMultiRecordTranscriptFile(fs, scenario.homeDir, {
          sessionId: scenario.sessionId,
          records: scenario.records,
          modifiedAtMs: scenario.nowMs,
          marker: scenario.contentNeedle,
        });

        const results = await searchAgentSessions({
          agentHomeDirs: agentHomeDirsFromHomeDir(scenario.homeDir),
          nowMs: scenario.nowMs,
          productScopeRoot: scenario.productScopeRoot,
          branchAssociatedWorktreeRoots: [],
          fs,
          query: agentSearchQueryFromOptions({ contains: scenario.contentNeedle }),
        });

        const [result] = results;
        return results.length === 1
          && result !== undefined
          && result.sessionId === scenario.sessionId
          && result.matches.includes(AGENT_SEARCH_MATCH_REASON.CONTAINS);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
