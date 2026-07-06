import {
  expectAgentArtifactDirectoryCreationDeferred,
  expectAgentOutputArtifactWriteFailure,
  expectAgentOutputCapturesStreamsAndEnv,
  expectAgentOutputDependencySurface,
  expectAgentOutputKeepsChildStreamsOffTerminal,
  expectAgentOutputPreservesCommandAndArgs,
} from "@testing/harnesses/testing/agent-test-output";
import { describe, it } from "vitest";

describe("agent test-output runner", () => {
  it("does not expose child-process helper constants on the production dependency surface", async () => {
    await expectAgentOutputDependencySurface();
  });

  it("defers artifact directory creation until a runner command executes", async () => {
    await expectAgentArtifactDirectoryCreationDeferred();
  });

  it("captures stdout and stderr to artifact files while preserving env and cwd", async () => {
    await expectAgentOutputCapturesStreamsAndEnv();
  });

  it("preserves the selected runner command and arguments in agent mode", async () => {
    await expectAgentOutputPreservesCommandAndArgs();
  });

  it("fails without artifact paths when artifact writing fails", async () => {
    await expectAgentOutputArtifactWriteFailure();
  });

  it("keeps captured child output off the invoking terminal streams", async () => {
    await expectAgentOutputKeepsChildStreamsOffTerminal();
  });
});
