import { describe, expect, it } from "vitest";

import { agentHomeDirsFromHomeDir } from "@/domains/agent/home";
import { agentSearchQueryFromOptions, searchAgentSessions } from "@/domains/agent/search";

import { arbitraryMovingSessionBranchScenario } from "@testing/generators/agent/search";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { MemoryAgentSessionFileSystem, writeClaudeMultiRecordTranscriptFile } from "@testing/harnesses/agent/resume";

describe("agent search — branch association scope boundary", () => {
  it("omits a session recording neither the branch nor any working directory in the product", async () => {
    const scenario = sampleGeneratedValue(arbitraryMovingSessionBranchScenario());
    const fs = new MemoryAgentSessionFileSystem();
    writeClaudeMultiRecordTranscriptFile(fs, scenario.homeDir, {
      sessionId: scenario.sessionId,
      records: scenario.records,
      modifiedAtMs: scenario.nowMs,
    });
    writeClaudeMultiRecordTranscriptFile(fs, scenario.homeDir, {
      sessionId: scenario.foreignOnlySessionId,
      records: scenario.foreignOnlyRecords,
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

    expect(results.map((result) => result.sessionId)).not.toContain(scenario.foreignOnlySessionId);
  });
});
