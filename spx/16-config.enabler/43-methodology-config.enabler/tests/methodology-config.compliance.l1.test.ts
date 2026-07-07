import { describe, it } from "vitest";

import {
  assertHarnessEnvironmentDefaultsExcludeMethodology,
  assertHarnessEnvironmentMethodologyRejects,
  assertMalformedMethodologyConfigRejects,
} from "@testing/harnesses/config/methodology";

describe("methodology config compliance", () => {
  it("rejects malformed methodology config before consumers run", async () => {
    await assertMalformedMethodologyConfigRejects();
  });

  it("rejects methodology under harnessEnvironment", async () => {
    await assertHarnessEnvironmentMethodologyRejects();
  });

  it("keeps methodology defaults out of harnessEnvironment", () => {
    assertHarnessEnvironmentDefaultsExcludeMethodology();
  });
});
