import { describe } from "vitest";

import { registerMarkdownE2eScenarioTests } from "@testing/harnesses/validation/markdown-subprocess";

describe("markdown validation e2e evidence", () => {
  registerMarkdownE2eScenarioTests();
});
