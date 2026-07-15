import { describe, it } from "vitest";

import { assertOwnershipClassificationMapping } from "@testing/harnesses/outcomeeng/source-graph";

describe("source artifact ownership classification", () => {
  it("maps provider facts and linked tests to every ownership classification", () => {
    assertOwnershipClassificationMapping();
  });
});
