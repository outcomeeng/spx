import { describe, it } from "vitest";

import { assertMethodologyVersionSelectionProperty } from "@testing/harnesses/diagnose/methodology-context";

describe("methodology-context version selection", () => {
  it("selects versions across generated cache directory sets", assertMethodologyVersionSelectionProperty);
});
