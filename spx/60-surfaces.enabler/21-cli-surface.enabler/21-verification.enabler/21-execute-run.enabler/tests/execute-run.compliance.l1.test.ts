import { describe, expect, it } from "vitest";

import { EXECUTE_RUN_CLI_SURFACE } from "@/interfaces/cli/verify";
import { inspectVerificationExecuteRunPath } from "@testing/harnesses/verify/harness";

describe("execute run compliance", () => {
  it("exposes the spx-driven run as a verification-type noun carrying the run verb", () => {
    expect(inspectVerificationExecuteRunPath()).toMatchObject({
      typeNounPresent: true,
      runVerbPresent: true,
    });
  });

  it("narrows the spx-driven run through a positional path operand, not a path-scope flag", () => {
    expect(inspectVerificationExecuteRunPath().runVerbVariadicOperandName).toBeDefined();
    EXECUTE_RUN_CLI_SURFACE.forbiddenPathScopeFlags.forEach((forbiddenFlag) => {
      expect(inspectVerificationExecuteRunPath().runVerbOptionFlags).not.toContain(forbiddenFlag);
    });
  });

  it("exposes no verification type as a verb command path", () => {
    EXECUTE_RUN_CLI_SURFACE.forbiddenTypeVerbNames.forEach((forbiddenVerbName) => {
      expect(inspectVerificationExecuteRunPath().verificationChildNames).not.toContain(forbiddenVerbName);
    });
  });
});
