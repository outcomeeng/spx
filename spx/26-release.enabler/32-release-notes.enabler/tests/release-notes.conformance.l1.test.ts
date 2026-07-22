import {
  CHANGELOG_CHANGE_GROUPS,
  CHANGELOG_TITLE,
  CHANGELOG_TITLE_TEXT,
  changelogVersionHeadingText,
  ReleaseNotesError,
} from "@/domains/release/release-notes";
import {
  sampleConformantReleaseNotesChangelogCases,
  sampleDuplicateCurrentVersionReleaseNotesChangelogCase,
  sampleH1BoundaryBeforeVersionReleaseNotesChangelogCase,
  sampleH1BoundaryReleaseNotesChangelogCase,
  sampleNonConformantReleaseNotesChangelogCases,
} from "@testing/generators/release/changelog";
import {
  KEEP_A_CHANGELOG_CHANGE_GROUPS,
  KEEP_A_CHANGELOG_TITLE,
  KEEP_A_CHANGELOG_TITLE_TEXT,
  keepAChangelogVersionHeadingText,
  MARKDOWN_HEADING_TAG,
  observeIndependentMarkdown,
} from "@testing/harnesses/release/keep-a-changelog-oracle";
import {
  composeEveryReleaseNotesCase,
  composeReleaseNotesCase,
  type ReleaseNotesConformanceFailureObservation,
} from "@testing/harnesses/release/release-notes-conformance";
import { describe, expect, it } from "vitest";

describe("composeReleaseNotes validates the read-back changelog against Keep a Changelog", () => {
  it("accepts every independently parsed conformant changelog shape", async () => {
    const observations = await Promise.all(
      sampleConformantReleaseNotesChangelogCases().map(async (testCase) => await composeReleaseNotesCase(testCase)),
    );
    for (const observation of observations) {
      const markdown = observeIndependentMarkdown(observation.content);
      expect(CHANGELOG_TITLE).toBe(KEEP_A_CHANGELOG_TITLE);
      expect(CHANGELOG_TITLE_TEXT).toBe(KEEP_A_CHANGELOG_TITLE_TEXT);
      expect(CHANGELOG_CHANGE_GROUPS).toEqual(KEEP_A_CHANGELOG_CHANGE_GROUPS);
      expect(changelogVersionHeadingText(observation.version)).toBe(
        keepAChangelogVersionHeadingText(observation.version),
      );
      expect(markdown.firstLine).toBe(KEEP_A_CHANGELOG_TITLE);
      const title = markdown.headings.at(0);
      expect(title).toMatchObject({ tag: MARKDOWN_HEADING_TAG.H1, text: KEEP_A_CHANGELOG_TITLE_TEXT });
      if (title === undefined) continue;
      const nextTitle = markdown.headings.find(
        (heading) => heading.index > title.index && heading.tag === MARKDOWN_HEADING_TAG.H1,
      );
      const versionHeading = markdown.headings.find(
        (heading) =>
          heading.index > title.index
          && (nextTitle === undefined || heading.index < nextTitle.index)
          && heading.tag === MARKDOWN_HEADING_TAG.H2
          && heading.text === keepAChangelogVersionHeadingText(observation.version),
      );
      expect(versionHeading).toBeDefined();
      if (versionHeading === undefined) continue;
      const nextRelease = markdown.headings.find(
        (heading) =>
          heading.index > versionHeading.index
          && (heading.tag === MARKDOWN_HEADING_TAG.H1 || heading.tag === MARKDOWN_HEADING_TAG.H2),
      );
      expect(
        markdown.headings.some(
          (heading) =>
            heading.index > versionHeading.index
            && (nextRelease === undefined || heading.index < nextRelease.index)
            && heading.tag === MARKDOWN_HEADING_TAG.H3
            && new Set<string>(KEEP_A_CHANGELOG_CHANGE_GROUPS).has(heading.text),
        ),
      ).toBe(true);
    }
  });

  it("rejects a changelog whose change group is in a later H1 section", async () => {
    await expect(composeReleaseNotesCase(sampleH1BoundaryReleaseNotesChangelogCase())).rejects.toThrow(
      ReleaseNotesError,
    );
  });

  it("rejects a changelog whose version section is in a later H1 section", async () => {
    await expect(composeReleaseNotesCase(sampleH1BoundaryBeforeVersionReleaseNotesChangelogCase())).rejects.toThrow(
      ReleaseNotesError,
    );
  });

  it("rejects a changelog with duplicate sections for the current version", async () => {
    await expect(composeReleaseNotesCase(sampleDuplicateCurrentVersionReleaseNotesChangelogCase())).rejects.toThrow(
      ReleaseNotesError,
    );
  });

  it("rejects every generated nonconformant changelog", async () => {
    await expect(composeEveryReleaseNotesCase(sampleNonConformantReleaseNotesChangelogCases())).resolves.toSatisfy(
      (results) =>
        results.every(
          (result: ReleaseNotesConformanceFailureObservation) =>
            result.error instanceof ReleaseNotesError && !result.finalPathIsFile,
        ),
    );
  });
});
