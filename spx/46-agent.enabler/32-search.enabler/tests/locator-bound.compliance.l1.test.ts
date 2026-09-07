import { describe, expect, it } from "vitest";

import {
  arbitraryCodexBranchEvidenceScenario,
  arbitraryMovingSessionBranchScenario,
} from "@testing/generators/agent/search";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { searchCodexBranchEvidenceStore, searchMovingSessionStore } from "@testing/harnesses/agent/search";

describe("agent search — locator read bound", () => {
  it("reads past the head only transcripts the locator named for a content selector", async () => {
    const scenario = sampleGeneratedValue(arbitraryMovingSessionBranchScenario());
    const observation = await searchMovingSessionStore(scenario, { contains: scenario.contentNeedle });

    expect(observation.locator.namedPaths()).toContain(observation.sessionPath);
    expect(observation.fs.textReadPaths()).toContain(observation.sessionPath);
    for (const path of observation.fs.textReadPaths()) {
      expect(observation.locator.namedPaths()).toContain(path);
    }
    expect(observation.fs.textReadPaths()).not.toContain(observation.decoyPath);
    expect(observation.fs.textReadPaths()).not.toContain(observation.foreignOnlyPath);
  });

  it("reads past the head only transcripts the locator named for a branch selector, in scanning and evidence collection", async () => {
    const scenario = sampleGeneratedValue(arbitraryMovingSessionBranchScenario());
    const observation = await searchMovingSessionStore(scenario, { branch: scenario.targetBranch });

    expect(observation.fs.textReadPaths()).toContain(observation.sessionPath);
    for (const path of observation.fs.textReadPaths()) {
      expect(observation.locator.namedPaths()).toContain(path);
    }
    expect(observation.fs.textReadPaths()).not.toContain(observation.decoyPath);
    expect(observation.fs.textReadPaths()).not.toContain(observation.foreignOnlyPath);
  });

  it("reads past the head only the Codex transcript the locator named during branch-evidence collection", async () => {
    const scenario = sampleGeneratedValue(arbitraryCodexBranchEvidenceScenario());
    const observation = await searchCodexBranchEvidenceStore(scenario);

    expect(observation.fs.textReadPaths()).toContain(observation.hitPath);
    for (const path of observation.fs.textReadPaths()) {
      expect(observation.locator.namedPaths()).toContain(path);
    }
    expect(observation.fs.textReadPaths()).not.toContain(observation.missPath);
    expect(observation.fs.textReadPaths()).not.toContain(observation.parentPath);
  });
});
