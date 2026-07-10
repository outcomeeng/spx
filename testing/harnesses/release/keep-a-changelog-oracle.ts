import MarkdownIt from "markdown-it";

import {
  oracleChangelogChangeGroups,
  oracleChangelogTitle,
  oracleChangelogTitleText,
} from "@testing/generators/release/changelog";

const MARKDOWN_TOKEN = {
  headingOpen: "heading_open",
  inline: "inline",
  blockquoteOpen: "blockquote_open",
  blockquoteClose: "blockquote_close",
  listItemOpen: "list_item_open",
  listItemClose: "list_item_close",
  h1: "h1",
  h2: "h2",
  h3: "h3",
} as const;
const CARRIAGE_RETURN = "\r";

interface ParsedMarkdownHeading {
  readonly tag: string;
  readonly text: string;
  readonly index: number;
}

export function independentKeepAChangelogConformance(notes: string, version: string): boolean {
  if (normalizeLineEnding(notes.split("\n")[0]) !== oracleChangelogTitle()) {
    return false;
  }
  const headings = parseMarkdownItHeadings(notes);
  const title = headings.at(0);
  if (title?.tag !== MARKDOWN_TOKEN.h1 || title.text !== oracleChangelogTitleText()) {
    return false;
  }
  const changelogSectionHeadings = headingsAfterVersionUntilNextReleaseSection(
    headings,
    title.index,
    MARKDOWN_TOKEN.h1,
  );
  const versionHeading = changelogSectionHeadings.find(
    (heading) => heading.tag === MARKDOWN_TOKEN.h2 && heading.text === `[${version}]`,
  );
  if (versionHeading === undefined) {
    return false;
  }
  const releaseSectionHeadings = headingsAfterVersionUntilNextReleaseSection(headings, versionHeading.index);
  const groupHeadings: ReadonlySet<string> = new Set(oracleChangelogChangeGroups());
  return releaseSectionHeadings.some(
    (heading) => heading.tag === MARKDOWN_TOKEN.h3 && groupHeadings.has(heading.text),
  );
}

function normalizeLineEnding(line: string | undefined): string | undefined {
  if (line === undefined) {
    return undefined;
  }
  return line.endsWith(CARRIAGE_RETURN) ? line.slice(0, -1) : line;
}

function parseMarkdownItHeadings(notes: string): readonly ParsedMarkdownHeading[] {
  const parser = new MarkdownIt({ html: true });
  const tokens = parser.parse(notes, {});
  const headings: ParsedMarkdownHeading[] = [];
  let blockquoteDepth = 0;
  let listItemDepth = 0;
  tokens.forEach((token, index) => {
    if (token.type === MARKDOWN_TOKEN.blockquoteOpen) {
      blockquoteDepth += 1;
      return;
    }
    if (token.type === MARKDOWN_TOKEN.blockquoteClose) {
      blockquoteDepth -= 1;
      return;
    }
    if (token.type === MARKDOWN_TOKEN.listItemOpen) {
      listItemDepth += 1;
      return;
    }
    if (token.type === MARKDOWN_TOKEN.listItemClose) {
      listItemDepth -= 1;
      return;
    }
    if (
      blockquoteDepth > 0
      || listItemDepth > 0
      || token.type !== MARKDOWN_TOKEN.headingOpen
    ) {
      return;
    }
    const inline = tokens.at(index + 1);
    if (inline === undefined || inline.type !== MARKDOWN_TOKEN.inline) {
      return;
    }
    headings.push({ tag: token.tag, text: inline.content, index });
  });
  return headings;
}

function headingsAfterVersionUntilNextReleaseSection(
  headings: readonly ParsedMarkdownHeading[],
  versionHeadingIndex: number,
  boundaryTag: string = MARKDOWN_TOKEN.h2,
): readonly ParsedMarkdownHeading[] {
  const afterVersion = headings.filter((heading) => heading.index > versionHeadingIndex);
  const nextReleaseSectionOffset = afterVersion.findIndex(
    (heading) => heading.tag === MARKDOWN_TOKEN.h1 || heading.tag === boundaryTag,
  );
  return nextReleaseSectionOffset === -1 ? afterVersion : afterVersion.slice(0, nextReleaseSectionOffset);
}
