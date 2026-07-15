import { describe, it } from "vitest";

import { assertTestFindingPayloadsConformToSchema } from "@testing/harnesses/verify/harness";

describe("test finding payload conformance", () => {
  it("accepts failing-case findings across the schema domain, including an empty errors array and empty-string messages", async () => {
    await assertTestFindingPayloadsConformToSchema();
  });
});
