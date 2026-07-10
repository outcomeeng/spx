import { describe } from "vitest";

import { registerTypeCheckComplianceTests } from "@testing/harnesses/validation/type-check";

describe("Compliance: tsc subprocess output is owned by the parent process", () => {
  registerTypeCheckComplianceTests();
});
