import { describe, it } from "vitest";

import { assertTestScopePayloadsConformToSchema } from "@testing/harnesses/verify/harness";

describe("test scope payload conformance", () => {
  it("accepts inspected test modules identified by module id", async () => {
    await assertTestScopePayloadsConformToSchema();
  });
});
