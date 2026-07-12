import { describe, it } from "vitest";

import {
  assertSpecContextMapsFailureDiagnostics,
  assertSpecContextResolvesAbbreviatedTarget,
} from "@testing/harnesses/spec/context";

describe("spec context target resolution mapping", () => {
  it("maps abbreviated node paths with trailing separators to canonical targets", async () => {
    await assertSpecContextResolvesAbbreviatedTarget();
  });

  it("maps every target failure variant to an actionable diagnostic", async () => {
    await assertSpecContextMapsFailureDiagnostics();
  });
});
