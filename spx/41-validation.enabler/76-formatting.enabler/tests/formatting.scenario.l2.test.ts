import { describe, it } from "vitest";

import { formattingScenarios } from "@testing/generators/validation/formatting";
import { runFormattingScenario } from "@testing/harnesses/validation/formatting";

describe("dprint formatting validation scenarios", () => {
  for (const scenario of formattingScenarios()) {
    it(scenario.title, () => runFormattingScenario(scenario), scenario.timeout);
  }
});
