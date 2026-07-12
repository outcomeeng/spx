import { describe } from "vitest";

import { registerLintSubprocessComplianceTests } from "@testing/harnesses/validation/cli";

describe("lint validation subprocess compliance", () => {
  registerLintSubprocessComplianceTests();
});
