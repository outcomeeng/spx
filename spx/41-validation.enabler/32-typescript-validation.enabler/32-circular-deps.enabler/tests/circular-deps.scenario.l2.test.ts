import { describe } from "vitest";

import { registerCircularDepsScenarioL2Tests } from "@testing/harnesses/validation/circular-deps";

describe("circular dependency validation subprocess", () => {
  registerCircularDepsScenarioL2Tests();
});
