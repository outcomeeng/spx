import { describe, it } from "vitest";

import { assertRealRunStreamsScopeAndFinding } from "@testing/harnesses/testing/journal-reporter";

describe("journal reporter real programmatic vitest run", () => {
  it("records one module scope and a finding for the failing case over a mixed one-pass, one-fail module, and none for the passing case", async () => {
    await assertRealRunStreamsScopeAndFinding();
  });
});
