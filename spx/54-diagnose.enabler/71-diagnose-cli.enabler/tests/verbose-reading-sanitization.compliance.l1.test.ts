import { describe, it } from "vitest";

import { assertVerboseDiagnoseSanitizesReadings } from "@testing/harnesses/diagnose/cli";

describe("verbose diagnose reading safety", () => {
  it("escapes terminal-control bytes while preserving JSON readings", () => {
    assertVerboseDiagnoseSanitizesReadings();
  });
});
