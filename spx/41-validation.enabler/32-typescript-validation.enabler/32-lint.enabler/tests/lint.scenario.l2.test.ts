import { describe } from "vitest";

import { registerLintSubprocessScenarioTests } from "@testing/harnesses/validation/cli";

describe("lint validation subprocess", () => {
  registerLintSubprocessScenarioTests();
});
