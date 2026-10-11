import { describe, expect, it } from "vitest";

import { validateTestScope } from "@/domains/verify/verify";
import { sampleVerifyTestValue, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import { assertTestScopePayloadsConformToSchema } from "@testing/harnesses/verify/harness";

describe("test scope payload conformance", () => {
  it("accepts inspected test modules identified by module id", async () => {
    await assertTestScopePayloadsConformToSchema();
  });

  it("accepts an optional array of product-relative read paths beside the module identifier", () => {
    const { payload, recordedPaths } = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.testReadPathsAcceptedCase());

    const result = validateTestScope(payload);

    expect(result.ok).toBe(true);
    expect(result.ok ? result.value.readPaths : undefined).toEqual(recordedPaths);
  });
});
