import { describe, it } from "vitest";

import {
  assertExecutorOpensSpxDrivenRunWithoutEvidenceAppendActions,
  assertExecutorReachesRunnerThroughRegistry,
  assertExecutorRecordsOnlyThroughRecorderOperations,
  assertRecorderRaisesWhenLifecycleCommandFails,
} from "@testing/harnesses/verification-exec/harness";

describe("spx-driven verification executor compliance", () => {
  it("records scope, finding, and terminal evidence only through the verify recorder lifecycle", async () => {
    await assertExecutorRecordsOnlyThroughRecorderOperations();
  });

  it("opens the run in spx drive mode so an unsealed run advertises no caller evidence-append action", async () => {
    await assertExecutorOpensSpxDrivenRunWithoutEvidenceAppendActions();
  });

  it("reaches the test type's runner through the testing registry, naming no language", async () => {
    await assertExecutorReachesRunnerThroughRegistry();
  });

  it("raises rather than swallows a non-OK recorder command for open, scope, finding, and finish", async () => {
    await assertRecorderRaisesWhenLifecycleCommandFails();
  });
});
