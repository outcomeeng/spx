import { describe } from "vitest";

import { registerTypeScriptValidationComplianceTests } from "@testing/harnesses/validation/typescript";

describe("TypeScript validation language gating", () => {
  registerTypeScriptValidationComplianceTests();
});
