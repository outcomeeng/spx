import { describe, expect, it } from "vitest";

import { VERIFICATION_RUN_CLI_SURFACE } from "@/interfaces/cli/verify";
import { inspectVerificationRunCommandNames } from "@testing/harnesses/verify/harness";

describe("verification command family compliance", () => {
  it("keeps journal mechanics out of the public verification command paths and exposes no top-level verify verb", () => {
    expect(inspectVerificationRunCommandNames().rootCommandNames).not.toContain(
      VERIFICATION_RUN_CLI_SURFACE.forbiddenRootCommandName,
    );
    VERIFICATION_RUN_CLI_SURFACE.forbiddenRunCommandNames.forEach((forbiddenCommandName) => {
      expect(inspectVerificationRunCommandNames().verificationCommandNames).not.toContain(forbiddenCommandName);
    });
  });
});
