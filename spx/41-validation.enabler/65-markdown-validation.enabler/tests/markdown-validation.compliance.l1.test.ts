import { describe } from "vitest";

import { registerMarkdownComplianceTests } from "@testing/harnesses/validation/markdown";

describe("markdown validation compliance evidence", () => {
  registerMarkdownComplianceTests();
});
