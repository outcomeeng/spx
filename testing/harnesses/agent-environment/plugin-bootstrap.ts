import { describe, expect, it } from "vitest";

import { classifyPluginBootstrapDeclarations } from "@/domains/agent-environment/plugin-bootstrap-status";
import { pluginBootstrapMappingCases } from "@testing/generators/agent-environment/plugin-bootstrap";

export function registerPluginBootstrapMappings(): void {
  describe("product-owned plugin bootstrap declarations", () => {
    it.each(pluginBootstrapMappingCases())("$title", (testCase) => {
      const status = classifyPluginBootstrapDeclarations(testCase.config);

      expect(status).toStrictEqual(testCase.expected);
      expect(status.expectations.flatMap((expectation) => expectation.plugins)).not.toContain(
        testCase.absentCatalogPlugin,
      );
    });
  });
}
