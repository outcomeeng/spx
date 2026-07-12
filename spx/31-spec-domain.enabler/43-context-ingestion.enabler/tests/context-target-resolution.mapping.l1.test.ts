import { describe, it } from "vitest";

import { specContextTargetMappingCases } from "@testing/harnesses/spec/context";

describe("spec context target resolution mapping", () => {
  it.each(specContextTargetMappingCases())("$title", async ({ assertMapping }) => {
    await assertMapping();
  });
});
