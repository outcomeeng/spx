import { describe, it } from "vitest";

import { assertTestFindingPayloadsConformToSchema } from "@testing/harnesses/verify/harness";

describe("test finding payload conformance", () => {
  it("accepts failing cases with module id, test name, and error messages including empty arrays", async () => {
    await assertTestFindingPayloadsConformToSchema();
  });
});
