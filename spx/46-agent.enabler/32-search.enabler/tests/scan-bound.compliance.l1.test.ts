import { describe, expect, it } from "vitest";

import { agentHomeDirsFromHomeDir } from "@/domains/agent/home";
import { agentSearchQueryFromOptions, searchAgentSessions } from "@/domains/agent/search";

import { arbitraryMovingSessionBranchScenario } from "@testing/generators/agent/search";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { MemoryAgentSessionFileSystem, writeClaudeMultiRecordTranscriptFile } from "@testing/harnesses/agent/resume";

describe("agent search — structural read bound", () => {
  it("performs no structural metadata read on a transcript whose content lacks the selector", async () => {
    const scenario = sampleGeneratedValue(arbitraryMovingSessionBranchScenario());
    const fs = new MemoryAgentSessionFileSystem();
    writeClaudeMultiRecordTranscriptFile(fs, scenario.homeDir, {
      sessionId: scenario.sessionId,
      records: scenario.records,
      modifiedAtMs: scenario.nowMs,
      marker: scenario.contentNeedle,
    });
    const decoyPath = writeClaudeMultiRecordTranscriptFile(fs, scenario.homeDir, {
      sessionId: scenario.decoySessionId,
      records: scenario.decoyRecords,
      modifiedAtMs: scenario.nowMs,
    });

    await searchAgentSessions({
      agentHomeDirs: agentHomeDirsFromHomeDir(scenario.homeDir),
      nowMs: scenario.nowMs,
      productScopeRoot: scenario.productScopeRoot,
      branchAssociatedWorktreeRoots: [],
      fs,
      query: agentSearchQueryFromOptions({ contains: scenario.contentNeedle }),
    });

    expect(fs.maxHeadReadBytes(decoyPath)).toBe(0);
  });
});
