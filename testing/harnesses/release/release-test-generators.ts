import { expect } from "vitest";

import { releaseNotesConformsToKeepAChangelog } from "@/domains/release/release-notes";
import { arbitraryKeepAChangelogConformanceCase } from "@testing/generators/release/changelog";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
import { independentKeepAChangelogConformance } from "@testing/harnesses/release/keep-a-changelog-oracle";
import { collectHarnessTestCases, describe, it } from "@testing/harnesses/vitest-registration";

function registerReleaseTestGeneratorPropertyTests(): void {
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
  });
}

export const releaseTestGeneratorPropertyCases = collectHarnessTestCases(
  registerReleaseTestGeneratorPropertyTests,
);
