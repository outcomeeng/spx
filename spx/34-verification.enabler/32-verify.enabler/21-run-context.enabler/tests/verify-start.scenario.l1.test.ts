import { describe, it } from "vitest";

import {
  assertStartCreatesRunContextAndLocator,
  assertStartFromNestedDirectoryUsesProductRelativeChangedScope,
  assertStartPersistsRunJournalAtLocatorTarget,
} from "@testing/harnesses/verify/harness";

describe("verify start run context", () => {
  it("creates a context, opens a run journal, and reports the run token, digest, changed scope, input, and locator", async () => {
    await assertStartCreatesRunContextAndLocator();
  });

  it("persists the run journal at the reported run target", async () => {
    await assertStartPersistsRunJournalAtLocatorTarget();
  });

  it("reports product-relative changed scope when started from a nested directory", async () => {
    await assertStartFromNestedDirectoryUsesProductRelativeChangedScope();
  });
});
