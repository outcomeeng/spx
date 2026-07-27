import { releaseNotesConformsToKeepAChangelog } from "@/domains/release/release-notes";
import { arbitraryKeepAChangelogConformanceCase } from "@testing/generators/release/changelog";
import { arbitraryPublicationSectionValidationScenario } from "@testing/generators/release/publication";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
import {
  KEEP_A_CHANGELOG_CHANGE_GROUPS,
  KEEP_A_CHANGELOG_TITLE,
  KEEP_A_CHANGELOG_TITLE_TEXT,
  keepAChangelogVersionHeadingText,
  MARKDOWN_HEADING_TAG,
  observeIndependentMarkdown,
  observeIndependentVersionSection,
} from "@testing/harnesses/release/keep-a-changelog-oracle";
import { describe, expect, it } from "vitest";

describe("release test generator changelog conformance", () => {
  it("agrees with the independent Markdown oracle", () => {
    assertProperty(
      arbitraryKeepAChangelogConformanceCase(),
      ({ releaseData, content }) => {
        const markdown = observeIndependentMarkdown(content);
        const title = markdown.headings.at(0);
        const nextTitle = title === undefined
          ? undefined
          : markdown.headings.find(
            (heading) => heading.index > title.index && heading.tag === MARKDOWN_HEADING_TAG.H1,
          );
        const versionHeading = title === undefined
          ? undefined
          : markdown.headings.find(
            (heading) =>
              heading.index > title.index
              && (nextTitle === undefined || heading.index < nextTitle.index)
              && heading.tag === MARKDOWN_HEADING_TAG.H2
              && heading.text === keepAChangelogVersionHeadingText(releaseData.version),
          );
        const nextRelease = versionHeading === undefined
          ? undefined
          : markdown.headings.find(
            (heading) =>
              heading.index > versionHeading.index
              && (heading.tag === MARKDOWN_HEADING_TAG.H1 || heading.tag === MARKDOWN_HEADING_TAG.H2),
          );
        const hasChangeGroup = versionHeading !== undefined
          && markdown.headings.some(
            (heading) =>
              heading.index > versionHeading.index
              && (nextRelease === undefined || heading.index < nextRelease.index)
              && heading.tag === MARKDOWN_HEADING_TAG.H3
              && new Set<string>(KEEP_A_CHANGELOG_CHANGE_GROUPS).has(heading.text),
          );
        const independentlyConforms = markdown.firstLine === KEEP_A_CHANGELOG_TITLE
          && title?.tag === MARKDOWN_HEADING_TAG.H1
          && title.text === KEEP_A_CHANGELOG_TITLE_TEXT
          && versionHeading !== undefined
          && hasChangeGroup;
        expect(releaseNotesConformsToKeepAChangelog(content, releaseData.version)).toBe(
          independentlyConforms,
        );
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });

  it("recognizes exact version-section cases across duplicate and footer boundaries", () => {
    assertProperty(
      arbitraryPublicationSectionValidationScenario(),
      (scenario) => {
        expect(
          observeIndependentVersionSection(scenario.validChangelog, scenario.version),
        ).toBeDefined();
        expect(
          observeIndependentVersionSection(scenario.footerChangelog, scenario.version),
        ).toBeDefined();
        expect(
          observeIndependentVersionSection(scenario.duplicateChangelog, scenario.version),
        ).toBeUndefined();
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });
});
