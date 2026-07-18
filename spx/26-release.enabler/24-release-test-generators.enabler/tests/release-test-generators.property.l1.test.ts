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

  it("generates two distinct domain literals", () => {
    assertProperty(
      RELEASE_TEST_GENERATOR.distinctDomainLiteralPair(),
      ([first, second]) => {
        expect(first.length).toBeGreaterThan(0);
        expect(second.length).toBeGreaterThan(0);
        expect(first).not.toBe(second);
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

  it("generates distinct Windows drive roots", () => {
    assertProperty(
      RELEASE_TEST_GENERATOR.distinctWindowsDriveRoots(),
      ([first, second]) => {
        expect(first).not.toBe(second);
        expect(win32.parse(first).root).toBe(first);
        expect(win32.parse(second).root).toBe(second);
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });

  it("generates distinct Windows UNC roots", () => {
    assertProperty(
      RELEASE_TEST_GENERATOR.distinctWindowsUncRoots(),
      ([first, second]) => {
        expect(first).not.toBe(second);
        expect(win32.parse(first).root).toBe(first);
        expect(win32.parse(second).root).toBe(second);
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });

  it("generates distinct Windows extended-length UNC roots", () => {
    assertProperty(
      RELEASE_TEST_GENERATOR.distinctWindowsExtendedLengthUncRoots(),
      ([first, second]) => {
        expect(first).not.toBe(second);
        expect(win32.isAbsolute(first)).toBe(true);
        expect(win32.isAbsolute(second)).toBe(true);
        expect(first.endsWith(win32.sep)).toBe(true);
        expect(second.endsWith(win32.sep)).toBe(true);
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });
});
