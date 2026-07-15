import { describe, expect, it } from "vitest";

import {
  createMarketplaceInstallProbe,
  MARKETPLACE_PLUGIN_COMMAND,
  type MarketplaceInstallProbeDependencies,
} from "@/commands/diagnose/probes";
import {
  classifyMarketplaceInstall,
  MARKETPLACE_INSTALL_REMEDIATION,
  marketplaceInstallRunner,
} from "@/domains/diagnose/checks/marketplace-install";
import {
  marketplaceInstallClassificationCases,
  type MarketplaceRegistrationMappingCase,
  marketplaceRegistrationMappingCases,
} from "@testing/generators/diagnose/marketplace-install";

function equalArgs(
  actual: readonly string[],
  expected: readonly string[],
): boolean {
  return actual.length === expected.length
    && actual.every((value, index) => value === expected[index]);
}

function marketplaceProbeDependencies(
  testCase: MarketplaceRegistrationMappingCase,
): MarketplaceInstallProbeDependencies {
  return {
    surfacePresent: (cli) => testCase.surfaceCaptures.some((capture) => capture.surface === cli),
    capture: (file, args) => {
      const surfaceCapture = testCase.surfaceCaptures.find((capture) => capture.surface === file);
      if (surfaceCapture === undefined) {
        return Promise.resolve({ ok: false, stdout: "" });
      }
      if (equalArgs(args, MARKETPLACE_PLUGIN_COMMAND.LIST_MARKETPLACES)) {
        return Promise.resolve(surfaceCapture.marketplaceCapture);
      }
      if (equalArgs(args, MARKETPLACE_PLUGIN_COMMAND.LIST_PLUGINS)) {
        return Promise.resolve(surfaceCapture.pluginCapture);
      }
      return Promise.resolve({ ok: false, stdout: "" });
    },
  };
}

export function registerMarketplaceInstallMappings(): void {
  describe("the marketplace-install check classifies the install state offered-against-installed", () => {
    it.each(marketplaceInstallClassificationCases())(
      "classifies the install state as $verdict (bucket $bucket)",
      (testCase) => {
        const record = classifyMarketplaceInstall(testCase.reading);

        expect(record.verdict).toBe(testCase.verdict);
        expect(record.bucket).toBe(testCase.bucket);
        expect(record.remediation).toBe(MARKETPLACE_INSTALL_REMEDIATION[testCase.verdict]);
      },
    );

    it.each(marketplaceRegistrationMappingCases())(
      "$title",
      async (testCase) => {
        const record = await marketplaceInstallRunner(
          createMarketplaceInstallProbe(marketplaceProbeDependencies(testCase)),
        )(testCase.manifest);

        expect(record.verdict).toBe(testCase.verdict);
        expect(record.bucket).toBe(testCase.bucket);
        expect(record.remediation).toBe(MARKETPLACE_INSTALL_REMEDIATION[testCase.verdict]);
      },
    );
  });
}
