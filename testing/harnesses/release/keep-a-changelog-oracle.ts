import MarkdownIt from "markdown-it";

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
export const MARKDOWN_HEADING_TAG = {
  H1: MARKDOWN_TOKEN.h1,
  H2: MARKDOWN_TOKEN.h2,
  H3: MARKDOWN_TOKEN.h3,
} as const;
export const KEEP_A_CHANGELOG_TITLE = "# Changelog";
export const KEEP_A_CHANGELOG_TITLE_TEXT = "Changelog";
export const KEEP_A_CHANGELOG_CHANGE_GROUPS = [
  "Added",
  "Changed",
  "Deprecated",
  "Removed",
  "Fixed",
  "Security",
] as const;
const CARRIAGE_RETURN = "\r";

export interface ParsedMarkdownHeading {
  readonly tag: string;
  readonly text: string;
  readonly index: number;
}

export interface IndependentMarkdownObservation {
  readonly firstLine: string | undefined;
  readonly headings: readonly ParsedMarkdownHeading[];
}

export function observeIndependentMarkdown(notes: string): IndependentMarkdownObservation {
  return {
    firstLine: normalizeLineEnding(notes.split("\n")[0]),
    headings: parseMarkdownItHeadings(notes),
  };
}

export function keepAChangelogVersionHeadingText(version: string): string {
  return `[${version}]`;
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
