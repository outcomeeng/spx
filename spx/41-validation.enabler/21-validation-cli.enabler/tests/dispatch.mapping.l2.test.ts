import { describe, it } from "vitest";

import { OUTPUT_MODE_NAMES } from "@/commands/validation/literal";
import { expectLiteralReportRemainsOnStdoutWhenFindingsSetNonZeroExit } from "@testing/harnesses/validation/cli";

describe("spx validation dispatch mappings", () => {
  it.each(OUTPUT_MODE_NAMES)("keeps %s literal findings on stdout", async (outputMode) => {
    await expectLiteralReportRemainsOnStdoutWhenFindingsSetNonZeroExit(outputMode);
  });
});
