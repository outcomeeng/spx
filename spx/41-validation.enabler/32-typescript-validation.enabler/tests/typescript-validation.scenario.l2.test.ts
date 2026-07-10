import { describe } from "vitest";

import { registerTypeScriptValidationScenarioTests } from "@testing/harnesses/validation/typescript";

describe("TypeScript validation pipeline subprocess", () => {
  registerTypeScriptValidationScenarioTests();
});
