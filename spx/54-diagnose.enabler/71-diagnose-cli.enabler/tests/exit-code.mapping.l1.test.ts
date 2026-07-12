import { describe, it } from "vitest";

import { assertExitCodeMapping } from "@testing/harnesses/diagnose/cli";

describe("the process exit code maps the overall verdict", () => {
  it("maps every verdict to its distinct source-owned exit code", assertExitCodeMapping);
});
