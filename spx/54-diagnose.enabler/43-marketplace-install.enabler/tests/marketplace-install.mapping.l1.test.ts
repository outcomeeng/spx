import { describe, expect, it } from "vitest";

import {
  classifyMarketplaceInstall,
  MARKETPLACE_INSTALL_VERDICT,
  type MarketplaceInstallReading,
} from "@/domains/diagnose/checks/marketplace-install";
import { VERDICT_BUCKET } from "@/domains/diagnose/types";

const reading = (overrides: Partial<MarketplaceInstallReading>): MarketplaceInstallReading => ({
  errored: false,
  surfacePresent: true,
  unregistered: false,
  drifted: false,
  ...overrides,
});

describe("the marketplace-install check classifies the install state offered-against-installed", () => {
  it.each([
    { overrides: { errored: true }, verdict: MARKETPLACE_INSTALL_VERDICT.UNKNOWN, bucket: VERDICT_BUCKET.UNKNOWN },
    {
      overrides: { surfacePresent: false },
      verdict: MARKETPLACE_INSTALL_VERDICT.NOT_APPLICABLE,
      bucket: VERDICT_BUCKET.NOT_APPLICABLE,
    },
    {
      overrides: { unregistered: true },
      verdict: MARKETPLACE_INSTALL_VERDICT.UNREGISTERED,
      bucket: VERDICT_BUCKET.BROKEN,
    },
    { overrides: { drifted: true }, verdict: MARKETPLACE_INSTALL_VERDICT.DRIFTED, bucket: VERDICT_BUCKET.DEGRADED },
    { overrides: {}, verdict: MARKETPLACE_INSTALL_VERDICT.INSTALLED, bucket: VERDICT_BUCKET.HEALTHY },
  ])("classifies the install state as $verdict (bucket $bucket)", ({ overrides, verdict, bucket }) => {
    const result = classifyMarketplaceInstall(reading(overrides));
    expect(result.verdict).toBe(verdict);
    expect(result.bucket).toBe(bucket);
    expect(result.remediation.length).toBeGreaterThan(0);
  });

  it("ranks an unregistered surface as broken even when another reading would drift", () => {
    const result = classifyMarketplaceInstall(reading({ unregistered: true, drifted: true }));
    expect(result.verdict).toBe(MARKETPLACE_INSTALL_VERDICT.UNREGISTERED);
  });
});
