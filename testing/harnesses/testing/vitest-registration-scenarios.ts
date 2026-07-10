import { describe, expect, it } from "vitest";

import { registerHarnessTestCases } from "@testing/harnesses/vitest-registration";

export function registerVitestRegistrationScenarioTests(): void {
  describe("shared Vitest registration", () => {
    it("rejects an empty collected case list", () => {
      expect(() => registerHarnessTestCases([])).toThrow();
    });
  });
}
