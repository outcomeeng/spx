import { win32 } from "node:path";

import { releaseNotesConformsToKeepAChangelog } from "@/domains/release/release-notes";
import { arbitraryKeepAChangelogConformanceCase } from "@testing/generators/release/changelog";
import { RELEASE_TEST_GENERATOR } from "@testing/generators/release/release";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
import { independentKeepAChangelogConformance } from "@testing/harnesses/release/keep-a-changelog-oracle";
import { describe, expect, it } from "vitest";

describe("release test generator contracts", () => {
  it("generates changelog cases that agree with the independent Markdown oracle", () => {
    assertProperty(
      arbitraryKeepAChangelogConformanceCase(),
      ({ releaseData, content }) => {
        expect(releaseNotesConformsToKeepAChangelog(content, releaseData.version)).toBe(
          independentKeepAChangelogConformance(content, releaseData.version),
        );
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });

  it("generates three distinct path segments", () => {
    assertProperty(
      RELEASE_TEST_GENERATOR.distinctPathSegmentTriple(),
      (segments) => {
        expect(segments).toHaveLength(3);
        expect(segments.every((segment) => segment.length > 0)).toBe(true);
        expect(new Set(segments)).toHaveLength(segments.length);
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });

  it("generates a semantic version distinct from the excluded version", () => {
    assertProperty(
      RELEASE_TEST_GENERATOR.semver().chain((excludedVersion) =>
        RELEASE_TEST_GENERATOR.distinctSemverFrom(excludedVersion).map((candidate) => ({
          candidate,
          excludedVersion,
        }))
      ),
      ({ candidate, excludedVersion }) => {
        expect(candidate).not.toBe(excludedVersion);
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });

  it("generates distinct Windows extended-length drive roots", () => {
    assertProperty(
      RELEASE_TEST_GENERATOR.distinctWindowsExtendedLengthDriveRoots(),
      ([first, second]) => {
        expect(first).not.toBe(second);
        expect(win32.parse(first).root).toBe(first);
        expect(win32.parse(second).root).toBe(second);
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });
});
