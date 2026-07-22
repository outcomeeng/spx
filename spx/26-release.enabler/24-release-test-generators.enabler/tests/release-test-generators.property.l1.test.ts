import { win32 } from "node:path";

import { releaseNotesConformsToKeepAChangelog } from "@/domains/release/release-notes";
import { usesWindowsPathSemantics } from "@/lib/file-system/pathContainment";
import { arbitraryKeepAChangelogConformanceCase } from "@testing/generators/release/changelog";
import { RELEASE_TEST_GENERATOR } from "@testing/generators/release/release";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
import {
  KEEP_A_CHANGELOG_CHANGE_GROUPS,
  KEEP_A_CHANGELOG_TITLE,
  KEEP_A_CHANGELOG_TITLE_TEXT,
  keepAChangelogVersionHeadingText,
  MARKDOWN_HEADING_TAG,
  observeIndependentMarkdown,
} from "@testing/harnesses/release/keep-a-changelog-oracle";
import { describe, expect, it } from "vitest";

describe("release test generator contracts", () => {
  it("generates changelog cases that agree with the independent Markdown oracle", () => {
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
        const firstHost = first.split(win32.sep).filter(Boolean).at(-2);
        const secondHost = second.split(win32.sep).filter(Boolean).at(-2);

        expect(usesWindowsPathSemantics(first)).toBe(true);
        expect(usesWindowsPathSemantics(second)).toBe(true);
        expect(win32.parse(first).root).toBe(first);
        expect(win32.parse(second).root).toBe(second);
        expect(win32.toNamespacedPath(first)).not.toBe(first);
        expect(win32.toNamespacedPath(second)).not.toBe(second);
        expect(firstHost).toBeDefined();
        expect(secondHost).toBeDefined();
        expect(firstHost).not.toBe(secondHost);
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });

  it("generates distinct Windows extended-length UNC roots", () => {
    assertProperty(
      RELEASE_TEST_GENERATOR.distinctWindowsExtendedLengthUncRoots(),
      ([first, second]) => {
        const firstNamespaceRoot = win32.parse(first).root;
        const secondNamespaceRoot = win32.parse(second).root;
        const [firstHost, firstShare, ...firstRemainder] = first.slice(firstNamespaceRoot.length).split(win32.sep)
          .filter(Boolean);
        const [secondHost, secondShare, ...secondRemainder] = second.slice(secondNamespaceRoot.length).split(
          win32.sep,
        ).filter(Boolean);

        expect(usesWindowsPathSemantics(first)).toBe(true);
        expect(usesWindowsPathSemantics(second)).toBe(true);
        expect(win32.isAbsolute(first)).toBe(true);
        expect(win32.isAbsolute(second)).toBe(true);
        expect(first.endsWith(win32.sep)).toBe(true);
        expect(second.endsWith(win32.sep)).toBe(true);
        expect(win32.toNamespacedPath(first)).toBe(first.slice(0, -win32.sep.length));
        expect(win32.toNamespacedPath(second)).toBe(second.slice(0, -win32.sep.length));
        expect(firstHost).toBeDefined();
        expect(firstShare).toBeDefined();
        expect(firstRemainder).toEqual([]);
        expect(secondHost).toBeDefined();
        expect(secondShare).toBeDefined();
        expect(secondRemainder).toEqual([]);
        expect(firstHost).not.toBe(secondHost);
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });
});
