import { describe, it } from "vitest";

import {
  assertAppendOnTerminalRunDoesNotMatchRecordedInputSelectors,
  assertAppendOnTerminalRunDoesNotRequireRecordedInputSidecar,
  assertAppendRejectsEvidenceAfterTerminalCompletion,
} from "@testing/harnesses/verify/harness";

describe("verify append terminal-rejection compliance", () => {
  it("rejects scope and finding evidence additions on a run carrying a terminal-completion event", async () => {
    await assertAppendRejectsEvidenceAfterTerminalCompletion();
  });

  it("rejects append on a terminal run before requiring its recorded-input sidecar", async () => {
    await assertAppendOnTerminalRunDoesNotRequireRecordedInputSidecar();
  });

  it("rejects append on a terminal run before matching its recorded-input selectors", async () => {
    await assertAppendOnTerminalRunDoesNotMatchRecordedInputSelectors();
  });
});
