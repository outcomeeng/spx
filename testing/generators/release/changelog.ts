import * as fc from "fast-check";

import {
  CHANGELOG_CHANGE_GROUPS,
  CHANGELOG_TITLE,
  type ChangelogChangeGroup,
  changelogGroupHeading,
  changelogVersionHeading,
} from "@/domains/release/release-notes";

const LINE_SEPARATOR = "\n";
const BLANK_LINE = "";
const ENTRY_PREFIX = "- ";
const EMPTY_CHANGELOG = "";

const CHANGELOG_DIR_PATTERN = /^[a-z][a-z0-9-]{2,8}$/;
const CHANGELOG_BASENAME_PATTERN = /^[A-Z][A-Z0-9-]{2,10}$/;
const MARKDOWN_SUFFIX = ".md";
const PATH_SEPARATOR = "/";
const PARENT_DIRECTORY = "..";
const ABSOLUTE_ROOT = "/";

/**
 * A configured changelog path within the working tree — a markdown file, optionally
 * nested one directory deep — for the case where the resolved configuration sets a
 * non-default `changelogPath`.
 */
export function arbitraryConfiguredChangelogPath(): fc.Arbitrary<string> {
  return fc
    .tuple(
      fc.option(fc.stringMatching(CHANGELOG_DIR_PATTERN), { nil: undefined }),
      fc.stringMatching(CHANGELOG_BASENAME_PATTERN),
    )
    .map(([directory, basename]) => {
      const file = `${basename}${MARKDOWN_SUFFIX}`;
      return directory === undefined ? file : `${directory}${PATH_SEPARATOR}${file}`;
    });
}

/**
 * A configured changelog path that escapes the working tree — parent-directory
 * traversal or an absolute path outside it — which path resolution must reject
 * before the agent runner is invoked.
 */
export function arbitraryEscapingChangelogPath(): fc.Arbitrary<string> {
  return fc.stringMatching(CHANGELOG_BASENAME_PATTERN).chain((basename) => {
    const file = `${basename}${MARKDOWN_SUFFIX}`;
    return fc.constantFrom(`${PARENT_DIRECTORY}${PATH_SEPARATOR}${file}`, `${ABSOLUTE_ROOT}${file}`);
  });
}

function formatEntries(subjects: readonly string[]): string {
  return subjects.map((subject) => `${ENTRY_PREFIX}${subject}`).join(LINE_SEPARATOR);
}

function conformantChangelogWith(
  group: ChangelogChangeGroup,
  version: string,
  subjects: readonly string[],
): string {
  return [
    CHANGELOG_TITLE,
    BLANK_LINE,
    changelogVersionHeading(version),
    changelogGroupHeading(group),
    formatEntries(subjects),
    BLANK_LINE,
  ].join(LINE_SEPARATOR);
}

/**
 * A conformant Keep a Changelog body for `version`: the title, a version section,
 * and the release's commit subjects grouped under a source-owned change group.
 * Draws the group from the source-owned set so a sample exercises any group.
 */
export function arbitraryConformantChangelog(
  version: string,
  subjects: readonly string[],
): fc.Arbitrary<string> {
  return fc
    .constantFrom(...CHANGELOG_CHANGE_GROUPS)
    .map((group) => conformantChangelogWith(group, version, subjects));
}

/** The source-owned change group the non-conformant cases use where a group heading must be present. */
const SAMPLE_CHANGE_GROUP = CHANGELOG_CHANGE_GROUPS[0];

/** A non-conformant changelog body paired with the structural defect it carries. */
export interface NonConformantChangelogCase {
  /** A description of the defect, for the test title. */
  readonly label: string;
  /** The non-conformant changelog body. */
  readonly content: string;
}

/**
 * The Keep a Changelog bodies the read-back validation must reject, one per
 * structural defect — missing title, missing version section, missing change-group
 * heading, and an empty body. Each isolates a single validator branch so every
 * branch is exercised when the cases drive a parameterized test.
 */
export function nonConformantChangelogCases(
  version: string,
  subjects: readonly string[],
): readonly NonConformantChangelogCase[] {
  const entries = formatEntries(subjects);
  const groupHeading = changelogGroupHeading(SAMPLE_CHANGE_GROUP);
  const versionHeading = changelogVersionHeading(version);
  return [
    {
      label: "is missing the title",
      content: [versionHeading, groupHeading, entries, BLANK_LINE].join(LINE_SEPARATOR),
    },
    {
      label: "is missing the version section",
      content: [CHANGELOG_TITLE, BLANK_LINE, groupHeading, entries, BLANK_LINE].join(LINE_SEPARATOR),
    },
    {
      label: "is missing a change-group heading",
      content: [CHANGELOG_TITLE, BLANK_LINE, versionHeading, entries, BLANK_LINE].join(LINE_SEPARATOR),
    },
    { label: "is empty", content: EMPTY_CHANGELOG },
  ];
}
