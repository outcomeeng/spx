import { describe, it } from "vitest";

import { assertFoldAcceptsNonDefaultCompletionNamespace } from "@testing/harnesses/journal/terminal-state-namespace";

describe("journal run-state namespace compatibility", () => {
  it("folds terminal-completion events from non-default namespaces", () => {
    assertFoldAcceptsNonDefaultCompletionNamespace();
  });
});
