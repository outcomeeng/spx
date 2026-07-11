import { describe, it } from "vitest";

import { expectLiteralReportsRemainOnStdoutWhenFindingsSetNonZeroExit } from "@testing/harnesses/validation/cli";

describe("spx validation dispatch mappings", () => {
  it("keeps literal finding reports on stdout for every report mode", async () => {
    await expectLiteralReportsRemainOnStdoutWhenFindingsSetNonZeroExit();
  });
});
