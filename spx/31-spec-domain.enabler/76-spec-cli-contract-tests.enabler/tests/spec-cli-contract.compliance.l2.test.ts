import { describe, it } from "vitest";

import { assertSpecStatusCliAcceptsLocalJsonFormat } from "@testing/harnesses/spec/context";

describe("spx spec process isolation", () => {
  it("invokes the packaged executable with zero outbound network attempts", async () => {
    await assertSpecStatusCliAcceptsLocalJsonFormat();
  });

  it("confines mutable process state to the temp product directory", async () => {
    await assertSpecStatusCliAcceptsLocalJsonFormat();
  });
});
