import { describe, it } from "vitest";

import {
  assertAgentHomeResolutionHonorsEnvironment,
  assertAgentHomeResolutionUsesDefaultHomes,
  assertAgentResumeUsesConfiguredAgentHomes,
  assertAgentSearchUsesConfiguredAgentHomes,
} from "@testing/harnesses/agent/resume";

describe("agent home resolution compliance", () => {
  it("resolves configured Codex and Claude Code homes before default homes", () => {
    assertAgentHomeResolutionHonorsEnvironment();
  });

  it("resolves default Codex and Claude Code homes when no configured homes exist", () => {
    assertAgentHomeResolutionUsesDefaultHomes();
  });

  it("uses configured Codex and Claude Code homes for resume discovery", async () => {
    await assertAgentResumeUsesConfiguredAgentHomes();
  });

  it("uses configured Codex and Claude Code homes for search discovery", async () => {
    await assertAgentSearchUsesConfiguredAgentHomes();
  });
});
