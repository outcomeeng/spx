import { describe, it } from "vitest";

import {
  expectValidationAllForwardsDirectoryScope,
  expectValidationAllForwardsFileScope,
  expectValidationAllForwardsProductionScope,
} from "@testing/harnesses/validation/cli";

describe("validation all CLI scope forwarding", () => {
  it("forwards production scope to the full-pipeline handler", async () => {
    await expectValidationAllForwardsProductionScope();
  });

  it("forwards a positional file operand to the full-pipeline handler", async () => {
    await expectValidationAllForwardsFileScope();
  });

  it("forwards a positional directory operand to the full-pipeline handler", async () => {
    await expectValidationAllForwardsDirectoryScope();
  });
});
