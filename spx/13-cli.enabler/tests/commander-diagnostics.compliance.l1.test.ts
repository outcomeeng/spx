import { describe, it } from "vitest";

import { assertCommanderDiagnosticsPreserveStructureAndLength } from "@testing/harnesses/cli/program";

describe("Commander diagnostics", () => {
  it("preserve complete multiline output while escaping terminal-control bytes", async () => {
    await assertCommanderDiagnosticsPreserveStructureAndLength();
  });
});
