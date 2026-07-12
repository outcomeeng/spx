import { describe, it } from "vitest";

import { assertOutputModeMapping } from "@testing/harnesses/diagnose/cli";

describe("spx diagnose output selection", () => {
  it("maps no selector, --verbose, and --json without changing diagnosis", assertOutputModeMapping);
});
