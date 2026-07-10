import { describe } from "vitest";

import { registerTypeCheckScenarioTests } from "@testing/harnesses/validation/type-check";

describe("spx validation typescript — language-gated type checking", () => {
  registerTypeCheckScenarioTests();
});
