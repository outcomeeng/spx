import { describe, expect, it } from "vitest";

import {
  classifyMarketplaceInstall,
  MARKETPLACE_INSTALL_VERDICT,
  type MarketplaceInstallReading,
} from "@/domains/diagnose/checks/marketplace-install";
import { VERDICT_BUCKET } from "@/domains/diagnose/types";

interface MarketplaceInstallCase {
  readonly overrides: Partial<MarketplaceInstallReading>;
  readonly verdict: (typeof MARKETPLACE_INSTALL_VERDICT)[keyof typeof MARKETPLACE_INSTALL_VERDICT];
  readonly bucket: (typeof VERDICT_BUCKET)[keyof typeof VERDICT_BUCKET];
}

const reading = (overrides: Partial<MarketplaceInstallReading>): MarketplaceInstallReading => ({
  configured: true,
  errored: false,
  surfacePresent: true,
  unregistered: false,
  drifted: false,
  ...overrides,
});

const marketplaceInstallCases: readonly MarketplaceInstallCase[] = [
  {
    overrides: {},
    verdict: MARKETPLACE_INSTALL_VERDICT.INSTALLED,
    bucket: VERDICT_BUCKET.HEALTHY,
  },
  {
    overrides: { drifted: true },
    verdict: MARKETPLACE_INSTALL_VERDICT.DRIFTED,
    bucket: VERDICT_BUCKET.DEGRADED,
  },
  {
    overrides: { unregistered: true },
    verdict: MARKETPLACE_INSTALL_VERDICT.UNREGISTERED,
    bucket: VERDICT_BUCKET.BROKEN,
  },
  {
    overrides: { surfacePresent: false },
    verdict: MARKETPLACE_INSTALL_VERDICT.CLI_UNAVAILABLE,
    bucket: VERDICT_BUCKET.DEGRADED,
  },
  {
    overrides: { configured: false, surfacePresent: false },
    verdict: MARKETPLACE_INSTALL_VERDICT.NOT_APPLICABLE,
    bucket: VERDICT_BUCKET.NOT_APPLICABLE,
  },
  {
    overrides: { errored: true },
    verdict: MARKETPLACE_INSTALL_VERDICT.UNKNOWN,
    bucket: VERDICT_BUCKET.UNKNOWN,
  },
];

describe("the marketplace-install check classifies the install state offered-against-installed", () => {
  it.each(marketplaceInstallCases)("classifies the install state as $verdict (bucket $bucket)", (testCase) => {
    const record = classifyMarketplaceInstall(reading(testCase.overrides));

    expect(record.verdict).toBe(testCase.verdict);
    expect(record.bucket).toBe(testCase.bucket);
    expect(record.remediation.length).toBeGreaterThan(0);
  });

  it("ranks an unregistered plugin CLI as broken even when another reading would drift", () => {
    const result = classifyMarketplaceInstall(reading({ unregistered: true, drifted: true }));

    expect(result.verdict).toBe(MARKETPLACE_INSTALL_VERDICT.UNREGISTERED);
  });
});
