import { describe, expect, it } from "vitest";

import { classifyVersionDelta, computeReleaseData } from "@/domains/release/release-data";
import { RELEASE_TEST_GENERATOR } from "@testing/generators/release/release";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
import { releaseDataGitDependencies } from "@testing/harnesses/release/release-data";

describe("classifyVersionDelta — advancing versions determine their delta", () => {
  it("classifies every generated advancing semantic-version pair", async () => {
    await assertProperty(
      RELEASE_TEST_GENERATOR.versionProgression(),
      ({ previousTag, version, versionDelta }) => {
        expect(classifyVersionDelta(previousTag, version)).toBe(versionDelta);
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });
});

describe("computeReleaseData — release data is a deterministic function of repository state", () => {
  it("produces identical release data for identical repository state", async () => {
    await assertProperty(
      RELEASE_TEST_GENERATOR.releaseDataDeterminismScenario(),
      async (scenario) => {
        const deps = releaseDataGitDependencies(scenario);
        const options = {
          productDir: scenario.productDir,
          packageVersion: scenario.expected.version,
          releaseRef: scenario.releaseRef,
          deps,
        };

        const first = await computeReleaseData(options);
        const second = await computeReleaseData(options);

        expect(first).toEqual(scenario.expected);
        expect(second).toEqual(first);
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });
});
