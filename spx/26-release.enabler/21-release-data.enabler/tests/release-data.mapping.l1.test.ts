import { describe, expect, it } from "vitest";

import { classifyVersionDelta, VERSION_DELTA } from "@/domains/release/release-data";
import { RELEASE_TEST_GENERATOR, sampleReleaseTestValue } from "@testing/generators/release/release";

describe("classifyVersionDelta — package version and previous release tag map to the version delta", () => {
  it.each(Object.values(VERSION_DELTA))("classifies a %s version bump", (delta) => {
    const { previousTag, packageVersion } = sampleReleaseTestValue(
      RELEASE_TEST_GENERATOR.versionBumpFor(delta),
    );

    expect(classifyVersionDelta(previousTag, packageVersion)).toBe(delta);
  });
});
