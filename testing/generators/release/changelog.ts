import * as fc from "fast-check";
import { resolve } from "node:path";

import type { ReleaseData } from "@/domains/release/release-data";
import { RELEASE_TEST_GENERATOR, sampleReleaseTestValue } from "@testing/generators/release/release";

const LINE_SEPARATOR = "\n";
const BLANK_LINE = "";
const ENTRY_PREFIX = "- ";
const EMPTY_CHANGELOG = "";
const ORACLE_CHANGELOG_TITLE = "# Changelog";
const ORACLE_CHANGELOG_TITLE_TEXT = "Changelog";
const ORACLE_CHANGELOG_VERSION_SECTION_PREFIX = "## [";
const ORACLE_CHANGELOG_VERSION_SECTION_SUFFIX = "]";
const ORACLE_CHANGELOG_CHANGE_GROUP_PREFIX = "### ";
const ORACLE_CHANGELOG_CHANGE_GROUPS = ["Added", "Changed", "Deprecated", "Removed", "Fixed", "Security"] as const;
const ORACLE_DEFAULT_CHANGELOG_PATH = "CHANGELOG.md";
const ORACLE_CHANGELOG_VERSION_HEADING_SUFFIX = " - unreleased";
const ORACLE_MARKDOWN_VERSION_CLOSING_HASHES = "##";
const ORACLE_MARKDOWN_CHANGE_GROUP_CLOSING_HASHES = "###";
const ORACLE_MARKDOWN_INTERSTITIAL_H1 = "# Notes";
const ORACLE_MARKDOWN_INTERSTITIAL_H2 = "## Notes";
const ORACLE_MARKDOWN_BLOCKQUOTE_PREFIX = ">";
const ORACLE_MARKDOWN_FENCE_BACKTICK_MARKER = "```";
const ORACLE_MARKDOWN_FENCE_TILDE_MARKER = "~~~";
const ORACLE_MARKDOWN_FENCE_INFO_STRING = "ts";
const ORACLE_MARKDOWN_HTML_BLOCK_OPEN = "<div>";
const ORACLE_MARKDOWN_HTML_BLOCK_CLOSE = "</div>";
const ORACLE_MARKDOWN_SCRIPT_BLOCK_OPEN = "<script>";
const ORACLE_MARKDOWN_SCRIPT_BLOCK_CLOSE = "</script>";
const ORACLE_MARKDOWN_TEXTAREA_BLOCK_OPEN = "<textarea>";
const ORACLE_MARKDOWN_TEXTAREA_BLOCK_CLOSE = "</textarea>";
const ORACLE_MARKDOWN_HTML_BLOCK_SUFFIX_LOOKALIKE_CLOSE = "</divish>";
const ORACLE_MARKDOWN_HTML_BLOCK_EMBEDDED_CLOSE = "text </div> text";
const ORACLE_MARKDOWN_MIXED_CASE_HTML_BLOCK_OPEN = "<DIV>";
const ORACLE_MARKDOWN_MIXED_CASE_HTML_BLOCK_CLOSE = "</div>";
const ORACLE_MARKDOWN_HTML_COMMENT_OPEN = "<!--";
const ORACLE_MARKDOWN_HTML_COMMENT_CLOSE = "-->";
const ORACLE_MARKDOWN_PROCESSING_INSTRUCTION_OPEN = "<?release-notes";
const ORACLE_MARKDOWN_PROCESSING_INSTRUCTION_CLOSE = "?>";
const ORACLE_MARKDOWN_DECLARATION_OPEN = "<!DOCTYPE changelog [";
const ORACLE_MARKDOWN_DECLARATION_CLOSE = "]>";
const ORACLE_MARKDOWN_CDATA_OPEN = "<![CDATA[";
const ORACLE_MARKDOWN_CDATA_CLOSE = "]]>";
const MALFORMED_FENCE_TAIL = "note";

const CHANGELOG_DIR_PATTERN = /^[a-z][a-z0-9-]{2,8}$/;
const CHANGELOG_BASENAME_PATTERN = /^[A-Z][A-Z0-9-]{2,10}$/;
const MARKDOWN_SUFFIX = ".md";
const PATH_SEPARATOR = "/";
const PARENT_DIRECTORY = "..";
const ABSOLUTE_ROOT = "/";
const BLANK_PATH_CHARACTER_MAX_COUNT = 16;
const CURRENT_DIRECTORY = ".";

type OracleChangelogChangeGroup = (typeof ORACLE_CHANGELOG_CHANGE_GROUPS)[number];

export function oracleChangelogChangeGroups(): readonly OracleChangelogChangeGroup[] {
  return ORACLE_CHANGELOG_CHANGE_GROUPS;
}

export function oracleChangelogTitle(): string {
  return ORACLE_CHANGELOG_TITLE;
}

export function oracleChangelogTitleText(): string {
  return ORACLE_CHANGELOG_TITLE_TEXT;
}

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

export function arbitraryNestedConfiguredChangelogPath(): fc.Arbitrary<string> {
  return fc
    .tuple(fc.stringMatching(CHANGELOG_DIR_PATTERN), fc.stringMatching(CHANGELOG_BASENAME_PATTERN))
    .map(([directory, basename]) => `${directory}${PATH_SEPARATOR}${basename}${MARKDOWN_SUFFIX}`);
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

/** A blank configured changelog path — empty or whitespace-only — which path resolution must reject. */
export function arbitraryBlankConfiguredChangelogPath(): fc.Arbitrary<string> {
  return fc.string({ maxLength: BLANK_PATH_CHARACTER_MAX_COUNT }).filter((path) => path.trim().length === 0);
}

/** A configured changelog path that resolves to the working tree root rather than a file. */
export function arbitraryRootResolvingChangelogPath(): fc.Arbitrary<string> {
  return fc
    .option(fc.stringMatching(CHANGELOG_DIR_PATTERN), { nil: undefined })
    .map((directory) =>
      directory === undefined ? CURRENT_DIRECTORY : `${directory}${PATH_SEPARATOR}${PARENT_DIRECTORY}`
    );
}

function formatEntries(subjects: readonly string[]): string {
  return subjects.map((subject) => `${ENTRY_PREFIX}${subject}`).join(LINE_SEPARATOR);
}

function h1BoundaryChangelog(version: string, subjects: readonly string[]): string {
  return [
    ORACLE_CHANGELOG_TITLE,
    BLANK_LINE,
    oracleChangelogVersionHeading(version),
    ORACLE_MARKDOWN_INTERSTITIAL_H1,
    oracleChangelogGroupHeading(SAMPLE_CHANGE_GROUP),
    formatEntries(subjects),
    BLANK_LINE,
  ].join(LINE_SEPARATOR);
}

function conformantChangelogWith(
  group: OracleChangelogChangeGroup,
  version: string,
  subjects: readonly string[],
): string {
  return [
    ORACLE_CHANGELOG_TITLE,
    BLANK_LINE,
    oracleChangelogVersionHeading(version),
    oracleChangelogGroupHeading(group),
    formatEntries(subjects),
    BLANK_LINE,
  ].join(LINE_SEPARATOR);
}

export function oracleChangelogVersionHeading(version: string): string {
  return `${ORACLE_CHANGELOG_VERSION_SECTION_PREFIX}${version}${ORACLE_CHANGELOG_VERSION_SECTION_SUFFIX}`;
}

function oracleChangelogGroupHeading(group: OracleChangelogChangeGroup): string {
  return `${ORACLE_CHANGELOG_CHANGE_GROUP_PREFIX}${group}`;
}

export function oracleResolvedChangelogPath(workingDirectory: string, changelogPath: string | undefined): string {
  return resolve(workingDirectory, changelogPath ?? ORACLE_DEFAULT_CHANGELOG_PATH);
}

/**
 * A conformant Keep a Changelog body for `version`: the title, a version section,
 * and the release's commit subjects grouped under a Keep a Changelog group.
 * Draws the group from the independent oracle set so a sample exercises any group.
 */
export function arbitraryConformantChangelog(
  version: string,
  subjects: readonly string[],
): fc.Arbitrary<string> {
  return fc
    .constantFrom(...ORACLE_CHANGELOG_CHANGE_GROUPS)
    .map((group) => conformantChangelogWith(group, version, subjects));
}

/** The oracle change group the non-conformant cases use where a group heading must be present. */
const SAMPLE_CHANGE_GROUP = ORACLE_CHANGELOG_CHANGE_GROUPS[0];

/** A suffix that makes a prior release's version heading distinct from the current one's. */
const PRIOR_VERSION_SUFFIX = "-prior";

/** A non-title preamble line, for the case where the title is present but does not open the file. */
const PREAMBLE_LINE = "Release history.";

/** An extra heading hash, for the case where the change-group heading is one level too deep. */
const DEEPER_HEADING_HASH = "#";

/** Extra title text, for the case where the first heading is not exactly the Keep a Changelog title. */
const TITLE_SUFFIX = " (draft)";
const TITLE_TRAILING_WHITESPACE = " ";
const BLOCKQUOTE_SEPARATOR = " ";
const INDENTED_CODE_PREFIX = "    ";

function blockquoteLine(line: string): string {
  return `${ORACLE_MARKDOWN_BLOCKQUOTE_PREFIX}${BLOCKQUOTE_SEPARATOR}${line}`;
}

function indentedCodeLine(line: string): string {
  return `${INDENTED_CODE_PREFIX}${line}`;
}

/**
 * A conformant Keep a Changelog body whose release section contains literal
 * backtick-fence text as indented code before and after the real change-group
 * heading. The literal lines must not alter heading recognition.
 */
export function conformantChangelogWithIndentedFenceText(
  version: string,
  subjects: readonly string[],
): string {
  return [
    ORACLE_CHANGELOG_TITLE,
    BLANK_LINE,
    oracleChangelogVersionHeading(version),
    indentedCodeLine(ORACLE_MARKDOWN_FENCE_BACKTICK_MARKER),
    oracleChangelogGroupHeading(SAMPLE_CHANGE_GROUP),
    formatEntries(subjects),
    indentedCodeLine(ORACLE_MARKDOWN_FENCE_BACKTICK_MARKER),
    BLANK_LINE,
  ].join(LINE_SEPARATOR);
}

export function conformantChangelogWithCdataText(
  version: string,
  subjects: readonly string[],
): string {
  return [
    ORACLE_CHANGELOG_TITLE,
    BLANK_LINE,
    oracleChangelogVersionHeading(version),
    ORACLE_MARKDOWN_CDATA_OPEN,
    oracleChangelogGroupHeading(SAMPLE_CHANGE_GROUP),
    formatEntries(subjects),
    ORACLE_MARKDOWN_CDATA_CLOSE,
    oracleChangelogGroupHeading(SAMPLE_CHANGE_GROUP),
    formatEntries(subjects),
    BLANK_LINE,
  ].join(LINE_SEPARATOR);
}

export function conformantChangelogWithAtxClosingHashes(
  version: string,
  subjects: readonly string[],
): string {
  return [
    ORACLE_CHANGELOG_TITLE,
    BLANK_LINE,
    `${oracleChangelogVersionHeading(version)} ${ORACLE_MARKDOWN_VERSION_CLOSING_HASHES}`,
    `${oracleChangelogGroupHeading(SAMPLE_CHANGE_GROUP)} ${ORACLE_MARKDOWN_CHANGE_GROUP_CLOSING_HASHES}`,
    formatEntries(subjects),
    BLANK_LINE,
  ].join(LINE_SEPARATOR);
}

export function conformantChangelogWithHtmlBlockTerminatedByBlankLine(
  version: string,
  subjects: readonly string[],
): string {
  return [
    ORACLE_CHANGELOG_TITLE,
    BLANK_LINE,
    `${ORACLE_MARKDOWN_HTML_BLOCK_OPEN}note${ORACLE_MARKDOWN_HTML_BLOCK_CLOSE}`,
    BLANK_LINE,
    oracleChangelogVersionHeading(version),
    oracleChangelogGroupHeading(SAMPLE_CHANGE_GROUP),
    formatEntries(subjects),
    BLANK_LINE,
  ].join(LINE_SEPARATOR);
}

/** A non-conformant changelog body paired with the structural defect it carries. */
export interface NonConformantChangelogCase {
  /** A description of the defect, for the test title. */
  readonly label: string;
  /** The non-conformant changelog body. */
  readonly content: string;
}

export interface ReleaseNotesChangelogCase {
  readonly releaseData: ReleaseData;
  readonly content: string;
}

export interface NonConformantReleaseNotesChangelogCase extends NonConformantChangelogCase {
  readonly releaseData: ReleaseData;
}

export function sampleConformantReleaseNotesChangelogCase(): ReleaseNotesChangelogCase {
  const { releaseData, subjects } = sampleReleaseNotesFixture();
  return {
    releaseData,
    content: sampleReleaseTestValue(arbitraryConformantChangelog(releaseData.version, subjects)),
  };
}

export function sampleIndentedFenceReleaseNotesChangelogCase(): ReleaseNotesChangelogCase {
  const { releaseData, subjects } = sampleReleaseNotesFixture();
  return {
    releaseData,
    content: conformantChangelogWithIndentedFenceText(releaseData.version, subjects),
  };
}

export function sampleAtxClosingHashesReleaseNotesChangelogCase(): ReleaseNotesChangelogCase {
  const { releaseData, subjects } = sampleReleaseNotesFixture();
  return {
    releaseData,
    content: conformantChangelogWithAtxClosingHashes(releaseData.version, subjects),
  };
}

export function sampleCdataReleaseNotesChangelogCase(): ReleaseNotesChangelogCase {
  const { releaseData, subjects } = sampleReleaseNotesFixture();
  return {
    releaseData,
    content: conformantChangelogWithCdataText(releaseData.version, subjects),
  };
}

export function sampleHtmlBlockTerminatedByBlankLineReleaseNotesChangelogCase(): ReleaseNotesChangelogCase {
  const { releaseData, subjects } = sampleReleaseNotesFixture();
  return {
    releaseData,
    content: conformantChangelogWithHtmlBlockTerminatedByBlankLine(
      releaseData.version,
      subjects,
    ),
  };
}

export function sampleH1BoundaryReleaseNotesChangelogCase(): ReleaseNotesChangelogCase {
  const { releaseData, subjects } = sampleReleaseNotesFixture();
  return {
    releaseData,
    content: h1BoundaryChangelog(releaseData.version, subjects),
  };
}

export function sampleNonConformantReleaseNotesChangelogCases(): readonly NonConformantReleaseNotesChangelogCase[] {
  const { releaseData, subjects } = sampleReleaseNotesFixture();
  return nonConformantChangelogCases(releaseData.version, subjects).map((changelogCase) => ({
    releaseData,
    ...changelogCase,
  }));
}

function sampleReleaseNotesFixture(): { readonly releaseData: ReleaseData; readonly subjects: readonly string[] } {
  const releaseData = sampleReleaseTestValue(RELEASE_TEST_GENERATOR.releaseData());
  return {
    releaseData,
    subjects: releaseData.commits.map((commit) => commit.subject),
  };
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
  const groupHeading = oracleChangelogGroupHeading(SAMPLE_CHANGE_GROUP);
  const versionHeading = oracleChangelogVersionHeading(version);
  return [
    {
      label: "is missing the title",
      content: [versionHeading, groupHeading, entries, BLANK_LINE].join(LINE_SEPARATOR),
    },
    {
      label: "appends extra text to the title heading",
      content: [
        `${ORACLE_CHANGELOG_TITLE}${TITLE_SUFFIX}`,
        BLANK_LINE,
        versionHeading,
        groupHeading,
        entries,
        BLANK_LINE,
      ].join(LINE_SEPARATOR),
    },
    {
      label: "appends trailing whitespace to the title heading",
      content: [
        `${ORACLE_CHANGELOG_TITLE}${TITLE_TRAILING_WHITESPACE}`,
        BLANK_LINE,
        versionHeading,
        groupHeading,
        entries,
        BLANK_LINE,
      ]
        .join(LINE_SEPARATOR),
    },
    {
      label: "does not open with the title",
      content: [
        PREAMBLE_LINE,
        BLANK_LINE,
        ORACLE_CHANGELOG_TITLE,
        BLANK_LINE,
        versionHeading,
        groupHeading,
        entries,
        BLANK_LINE,
      ]
        .join(LINE_SEPARATOR),
    },
    {
      label: "opens with a blank line before the title",
      content: [BLANK_LINE, ORACLE_CHANGELOG_TITLE, BLANK_LINE, versionHeading, groupHeading, entries, BLANK_LINE]
        .join(LINE_SEPARATOR),
    },
    {
      label: "is missing the version section",
      content: [ORACLE_CHANGELOG_TITLE, BLANK_LINE, groupHeading, entries, BLANK_LINE].join(LINE_SEPARATOR),
    },
    {
      label: "appends trailing text to the version heading",
      content: [
        ORACLE_CHANGELOG_TITLE,
        BLANK_LINE,
        `${versionHeading}${ORACLE_CHANGELOG_VERSION_HEADING_SUFFIX}`,
        groupHeading,
        entries,
        BLANK_LINE,
      ].join(LINE_SEPARATOR),
    },
    {
      label: "puts the version section inside a fenced code block",
      content: [
        ORACLE_CHANGELOG_TITLE,
        BLANK_LINE,
        ORACLE_MARKDOWN_FENCE_BACKTICK_MARKER,
        versionHeading,
        groupHeading,
        entries,
        ORACLE_MARKDOWN_FENCE_BACKTICK_MARKER,
        BLANK_LINE,
      ].join(LINE_SEPARATOR),
    },
    {
      label: "puts the version section inside an info-string fenced code block",
      content: [
        ORACLE_CHANGELOG_TITLE,
        BLANK_LINE,
        `${ORACLE_MARKDOWN_FENCE_BACKTICK_MARKER}${ORACLE_MARKDOWN_FENCE_INFO_STRING}`,
        versionHeading,
        groupHeading,
        entries,
        ORACLE_MARKDOWN_FENCE_BACKTICK_MARKER,
        BLANK_LINE,
      ].join(LINE_SEPARATOR),
    },
    {
      label: "quotes the version section as blockquote text",
      content: [
        ORACLE_CHANGELOG_TITLE,
        BLANK_LINE,
        blockquoteLine(versionHeading),
        blockquoteLine(groupHeading),
        blockquoteLine(entries),
        BLANK_LINE,
      ].join(LINE_SEPARATOR),
    },
    {
      label: "puts the version section inside a raw HTML block",
      content: [
        ORACLE_CHANGELOG_TITLE,
        BLANK_LINE,
        ORACLE_MARKDOWN_HTML_BLOCK_OPEN,
        versionHeading,
        groupHeading,
        entries,
        ORACLE_MARKDOWN_HTML_BLOCK_CLOSE,
        BLANK_LINE,
      ].join(LINE_SEPARATOR),
    },
    {
      label: "puts the version section inside a mixed-case raw HTML block",
      content: [
        ORACLE_CHANGELOG_TITLE,
        BLANK_LINE,
        ORACLE_MARKDOWN_MIXED_CASE_HTML_BLOCK_OPEN,
        versionHeading,
        groupHeading,
        entries,
        ORACLE_MARKDOWN_MIXED_CASE_HTML_BLOCK_CLOSE,
        BLANK_LINE,
      ].join(LINE_SEPARATOR),
    },
    {
      label: "puts the version section inside a raw HTML comment",
      content: [
        ORACLE_CHANGELOG_TITLE,
        BLANK_LINE,
        ORACLE_MARKDOWN_HTML_COMMENT_OPEN,
        versionHeading,
        groupHeading,
        entries,
        ORACLE_MARKDOWN_HTML_COMMENT_CLOSE,
        BLANK_LINE,
      ].join(LINE_SEPARATOR),
    },
    {
      label: "puts the version section inside a raw HTML processing instruction",
      content: [
        ORACLE_CHANGELOG_TITLE,
        BLANK_LINE,
        ORACLE_MARKDOWN_PROCESSING_INSTRUCTION_OPEN,
        versionHeading,
        groupHeading,
        entries,
        ORACLE_MARKDOWN_PROCESSING_INSTRUCTION_CLOSE,
        BLANK_LINE,
      ].join(LINE_SEPARATOR),
    },
    {
      label: "puts the version heading at the wrong level",
      content: [
        ORACLE_CHANGELOG_TITLE,
        BLANK_LINE,
        `${DEEPER_HEADING_HASH}${versionHeading}`,
        groupHeading,
        entries,
        BLANK_LINE,
      ]
        .join(LINE_SEPARATOR),
    },
    {
      label: "is missing a change-group heading",
      content: [ORACLE_CHANGELOG_TITLE, BLANK_LINE, versionHeading, entries, BLANK_LINE].join(LINE_SEPARATOR),
    },
    {
      label: "puts another h2 section before the change-group heading",
      content: [
        ORACLE_CHANGELOG_TITLE,
        BLANK_LINE,
        versionHeading,
        ORACLE_MARKDOWN_INTERSTITIAL_H2,
        groupHeading,
        entries,
        BLANK_LINE,
      ].join(LINE_SEPARATOR),
    },
    {
      label: "puts the change-group heading inside a fenced code block",
      content: [
        ORACLE_CHANGELOG_TITLE,
        BLANK_LINE,
        versionHeading,
        ORACLE_MARKDOWN_FENCE_BACKTICK_MARKER,
        groupHeading,
        entries,
        ORACLE_MARKDOWN_FENCE_BACKTICK_MARKER,
        BLANK_LINE,
      ].join(LINE_SEPARATOR),
    },
    {
      label: "puts the change-group heading inside an info-string fenced code block",
      content: [
        ORACLE_CHANGELOG_TITLE,
        BLANK_LINE,
        versionHeading,
        `${ORACLE_MARKDOWN_FENCE_TILDE_MARKER}${ORACLE_MARKDOWN_FENCE_INFO_STRING}`,
        groupHeading,
        entries,
        ORACLE_MARKDOWN_FENCE_TILDE_MARKER,
        BLANK_LINE,
      ].join(LINE_SEPARATOR),
    },
    {
      label: "puts the change-group heading after a malformed backtick fence close inside a fenced code block",
      content: [
        ORACLE_CHANGELOG_TITLE,
        BLANK_LINE,
        versionHeading,
        ORACLE_MARKDOWN_FENCE_BACKTICK_MARKER,
        `${ORACLE_MARKDOWN_FENCE_BACKTICK_MARKER}${MALFORMED_FENCE_TAIL}`,
        groupHeading,
        entries,
        ORACLE_MARKDOWN_FENCE_BACKTICK_MARKER,
        BLANK_LINE,
      ].join(LINE_SEPARATOR),
    },
    {
      label: "puts the change-group heading after a malformed tilde fence close inside a fenced code block",
      content: [
        ORACLE_CHANGELOG_TITLE,
        BLANK_LINE,
        versionHeading,
        ORACLE_MARKDOWN_FENCE_TILDE_MARKER,
        `${ORACLE_MARKDOWN_FENCE_TILDE_MARKER}${MALFORMED_FENCE_TAIL}`,
        groupHeading,
        entries,
        ORACLE_MARKDOWN_FENCE_TILDE_MARKER,
        BLANK_LINE,
      ].join(LINE_SEPARATOR),
    },
    {
      label: "quotes the change-group heading as blockquote text",
      content: [
        ORACLE_CHANGELOG_TITLE,
        BLANK_LINE,
        versionHeading,
        blockquoteLine(groupHeading),
        blockquoteLine(entries),
        BLANK_LINE,
      ].join(LINE_SEPARATOR),
    },
    {
      label: "puts the change-group heading inside a raw HTML block",
      content: [
        ORACLE_CHANGELOG_TITLE,
        BLANK_LINE,
        versionHeading,
        ORACLE_MARKDOWN_HTML_BLOCK_OPEN,
        groupHeading,
        entries,
        ORACLE_MARKDOWN_HTML_BLOCK_CLOSE,
        BLANK_LINE,
      ].join(LINE_SEPARATOR),
    },
    {
      label: "puts the change-group heading inside a script HTML block with a blank line before close",
      content: [
        ORACLE_CHANGELOG_TITLE,
        BLANK_LINE,
        versionHeading,
        ORACLE_MARKDOWN_SCRIPT_BLOCK_OPEN,
        groupHeading,
        entries,
        BLANK_LINE,
        ORACLE_MARKDOWN_SCRIPT_BLOCK_CLOSE,
        BLANK_LINE,
      ].join(LINE_SEPARATOR),
    },
    {
      label: "puts the change-group heading inside a textarea HTML block with a blank line before close",
      content: [
        ORACLE_CHANGELOG_TITLE,
        BLANK_LINE,
        versionHeading,
        ORACLE_MARKDOWN_TEXTAREA_BLOCK_OPEN,
        groupHeading,
        entries,
        BLANK_LINE,
        ORACLE_MARKDOWN_TEXTAREA_BLOCK_CLOSE,
        BLANK_LINE,
      ].join(LINE_SEPARATOR),
    },
    {
      label: "puts the change-group heading after a suffix-lookalike raw HTML close inside a raw HTML block",
      content: [
        ORACLE_CHANGELOG_TITLE,
        BLANK_LINE,
        versionHeading,
        ORACLE_MARKDOWN_HTML_BLOCK_OPEN,
        ORACLE_MARKDOWN_HTML_BLOCK_SUFFIX_LOOKALIKE_CLOSE,
        groupHeading,
        entries,
        ORACLE_MARKDOWN_HTML_BLOCK_CLOSE,
        BLANK_LINE,
      ].join(LINE_SEPARATOR),
    },
    {
      label: "puts the change-group heading after an embedded raw HTML close inside a raw HTML block",
      content: [
        ORACLE_CHANGELOG_TITLE,
        BLANK_LINE,
        versionHeading,
        ORACLE_MARKDOWN_HTML_BLOCK_OPEN,
        ORACLE_MARKDOWN_HTML_BLOCK_EMBEDDED_CLOSE,
        groupHeading,
        entries,
        ORACLE_MARKDOWN_HTML_BLOCK_CLOSE,
        BLANK_LINE,
      ].join(LINE_SEPARATOR),
    },
    {
      label: "puts the change-group heading inside a raw HTML comment",
      content: [
        ORACLE_CHANGELOG_TITLE,
        BLANK_LINE,
        versionHeading,
        ORACLE_MARKDOWN_HTML_COMMENT_OPEN,
        groupHeading,
        entries,
        ORACLE_MARKDOWN_HTML_COMMENT_CLOSE,
        BLANK_LINE,
      ].join(LINE_SEPARATOR),
    },
    {
      label: "puts the change-group heading inside a raw HTML declaration",
      content: [
        ORACLE_CHANGELOG_TITLE,
        BLANK_LINE,
        versionHeading,
        ORACLE_MARKDOWN_DECLARATION_OPEN,
        groupHeading,
        entries,
        ORACLE_MARKDOWN_DECLARATION_CLOSE,
        BLANK_LINE,
      ].join(LINE_SEPARATOR),
    },
    {
      label: "puts the change-group heading inside a CDATA block",
      content: [
        ORACLE_CHANGELOG_TITLE,
        BLANK_LINE,
        versionHeading,
        ORACLE_MARKDOWN_CDATA_OPEN,
        groupHeading,
        entries,
        ORACLE_MARKDOWN_CDATA_CLOSE,
        BLANK_LINE,
      ].join(LINE_SEPARATOR),
    },
    {
      label: "uses a heading one level too deep for the change group",
      content: [
        ORACLE_CHANGELOG_TITLE,
        BLANK_LINE,
        versionHeading,
        `${DEEPER_HEADING_HASH}${groupHeading}`,
        entries,
        BLANK_LINE,
      ]
        .join(LINE_SEPARATOR),
    },
    {
      label: "groups a prior version's section but leaves the current release's ungrouped",
      content: [
        ORACLE_CHANGELOG_TITLE,
        BLANK_LINE,
        versionHeading,
        entries,
        BLANK_LINE,
        oracleChangelogVersionHeading(`${version}${PRIOR_VERSION_SUFFIX}`),
        groupHeading,
        entries,
        BLANK_LINE,
      ].join(LINE_SEPARATOR),
    },
    { label: "is empty", content: EMPTY_CHANGELOG },
  ];
}
