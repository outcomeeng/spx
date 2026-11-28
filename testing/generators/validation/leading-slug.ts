/**
 * Cases of markdown validation's leading-slug judgment: files of a spec tree whose rows and
 * headings open with leading slugs at given lines, and the errors the judgment reports for them.
 *
 * @module generators/validation/leading-slug
 */

import * as fc from "fast-check";

import { DECISION_SUFFIXES, SPEC_TREE_CONFIG, SPEC_TREE_GRAMMAR } from "@/lib/spec-tree";
import { MARKDOWN_RESERVED_LEADING_SLUG } from "@/validation/steps/markdown-leading-slug-rule";
import { sampleGeneratedValue } from "@testing/generators/sample";

const LINE_BREAK = "\n";
const ROW_TAIL = ": ALWAYS: a submitted line yields a task.";
const UNSLUGGED_ROW = "- ALWAYS: a submitted line yields a task.";
const MAPPING_HEADING_PREFIX = "### Test.Mapping: ";
const TITLE_PREFIX = "# ";
const FILLER_PREFIX = "Filler line ";
const FILLER_SUFFIX = ".";
const DECISION_INDEX = { MIN: 11, MAX: 98 } as const;
const SLUG_WORD = /^[a-z]{3,9}$/;
const FIRST_LINE = 1;

/** What stands on a judged line: a slugged row, a slugged Mapping heading, or a row with no leading slug. */
export const LEADING_SLUG_LINE_KIND = {
  ROW: "row",
  HEADING: "heading",
  UNSLUGGED: "unslugged",
} as const;

export type LeadingSlugLineKind = (typeof LEADING_SLUG_LINE_KIND)[keyof typeof LEADING_SLUG_LINE_KIND];

/** One slugged or unslugged line of a case file. */
export type LeadingSlugLine = {
  readonly line: number;
  readonly kind: LeadingSlugLineKind;
  readonly slug: string;
};

/** One file of a case: its product-relative path, its text, and the errors the judgment reports for it. */
export type LeadingSlugCaseFile = {
  readonly path: string;
  readonly text: string;
  readonly errors: readonly { readonly line: number; readonly slug: string }[];
};

export type LeadingSlugErrorCase = {
  readonly label: string;
  readonly files: readonly LeadingSlugCaseFile[];
};

function arbitrarySlug(): fc.Arbitrary<string> {
  return fc.tuple(fc.stringMatching(SLUG_WORD), fc.stringMatching(SLUG_WORD)).map(([first, second]) =>
    `${first}-${second}`
  );
}

function lineText(slugLine: LeadingSlugLine): string {
  switch (slugLine.kind) {
    case LEADING_SLUG_LINE_KIND.ROW:
      return `- ${slugLine.slug}${ROW_TAIL}`;
    case LEADING_SLUG_LINE_KIND.HEADING:
      return `${MAPPING_HEADING_PREFIX}${slugLine.slug}`;
    case LEADING_SLUG_LINE_KIND.UNSLUGGED:
      return UNSLUGGED_ROW;
  }
}

/** The text of a file whose given lines hold the given rows and headings, with a title and filler prose between. */
export function leadingSlugFileText(slugLines: readonly LeadingSlugLine[]): string {
  const last = Math.max(FIRST_LINE, ...slugLines.map(({ line }) => line));
  const lines: string[] = [];
  for (let line = FIRST_LINE; line <= last; line++) {
    const slugLine = slugLines.find((candidate) => candidate.line === line);
    if (slugLine !== undefined) lines.push(lineText(slugLine));
    else if (line === FIRST_LINE) lines.push(`${TITLE_PREFIX}${FILLER_PREFIX}${line}`);
    else lines.push(line % 2 === 0 ? "" : `${FILLER_PREFIX}${line}${FILLER_SUFFIX}`);
  }
  return `${lines.join(LINE_BREAK)}${LINE_BREAK}`;
}

/** A product-relative decision-record path under `spx/`. */
export function arbitraryDecisionRecordPath(): fc.Arbitrary<string> {
  return fc
    .tuple(fc.integer(DECISION_INDEX), fc.stringMatching(SLUG_WORD), fc.constantFrom(...DECISION_SUFFIXES))
    .map(([index, slug, suffix]) =>
      `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}${SPEC_TREE_GRAMMAR.PATH_SEPARATOR}${index}-${slug}${suffix}`
    );
}

function caseFile(
  path: string,
  slugLines: readonly LeadingSlugLine[],
  errorLines: readonly number[],
): LeadingSlugCaseFile {
  return {
    path,
    text: leadingSlugFileText(slugLines),
    errors: errorLines.map((line) => ({
      line,
      slug: slugLines.find((candidate) => candidate.line === line)?.slug ?? "",
    })),
  };
}

/** The cases of the `slug-errors` Mapping, one per row of its table, each in decision records with generated paths and slugs. */
export function leadingSlugErrorCases(): readonly LeadingSlugErrorCase[] {
  const [first, second] = sampleGeneratedValue(fc.uniqueArray(arbitrarySlug(), { minLength: 2, maxLength: 2 }));
  const [path, otherPath] = sampleGeneratedValue(
    fc.uniqueArray(arbitraryDecisionRecordPath(), { minLength: 2, maxLength: 2 }),
  );
  const row = (line: number, slug: string): LeadingSlugLine => ({ line, kind: LEADING_SLUG_LINE_KIND.ROW, slug });
  const unslugged = (line: number): LeadingSlugLine => ({ line, kind: LEADING_SLUG_LINE_KIND.UNSLUGGED, slug: "" });
  return [
    { label: "no-slug", files: [caseFile(path, [unslugged(9), unslugged(12)], [])] },
    { label: "unique", files: [caseFile(path, [row(9, first), row(12, second)], [])] },
    { label: "partly-slugged", files: [caseFile(path, [row(9, first), unslugged(12)], [])] },
    { label: "repeated", files: [caseFile(path, [row(9, first), row(14, first)], [14])] },
    {
      label: "heading-and-row",
      files: [caseFile(path, [{ line: 20, kind: LEADING_SLUG_LINE_KIND.HEADING, slug: first }, row(31, first)], [31])],
    },
    { label: "thrice", files: [caseFile(path, [row(9, first), row(14, first), row(22, first)], [14, 22])] },
    { label: "reserved", files: [caseFile(path, [row(9, MARKDOWN_RESERVED_LEADING_SLUG)], [9])] },
    { label: "two-files", files: [caseFile(path, [row(9, first)], []), caseFile(otherPath, [row(9, first)], [])] },
  ];
}

/** A file whose leading slug repeats at lines 9 and 14, which the judgment reports at line 14 wherever it judges the file. */
export function repeatedSlugFileText(): { readonly text: string; readonly line: number; readonly slug: string } {
  const slug = sampleGeneratedValue(arbitrarySlug());
  const repeatLine = 14;
  return {
    text: leadingSlugFileText([
      { line: 9, kind: LEADING_SLUG_LINE_KIND.ROW, slug },
      { line: repeatLine, kind: LEADING_SLUG_LINE_KIND.ROW, slug },
    ]),
    line: repeatLine,
    slug,
  };
}

const SLUG_SCOPE_NODE_DIRECTORY = `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}${SPEC_TREE_GRAMMAR.PATH_SEPARATOR}21-capture.capability`;
const SLUG_SCOPE_NODE_SLUG = "capture";
const DOCS_DIRECTORY = "docs";
const MARKDOWN_EXTENSION = ".md";
const OUTCOME_RECORD_SUFFIX = ".outcome.md";

function nodeFile(...segments: readonly string[]): string {
  return [SLUG_SCOPE_NODE_DIRECTORY, ...segments].join(SPEC_TREE_GRAMMAR.PATH_SEPARATOR);
}

/** The product-relative path of a 4.0 node spec the leading-slug judgment covers. */
export function slugScopeNodeSpecPath(): string {
  return nodeFile(`${SLUG_SCOPE_NODE_SLUG}${SPEC_TREE_GRAMMAR.SPEC_FILE.CANONICAL_SUFFIX}`);
}

/** The Markdown files the leading-slug judgment never covers, by the kind each is, at product-relative paths. */
export function slugScopeUnjudgedFiles(): readonly (readonly [string, string])[] {
  return [
    ["ISSUES.md", nodeFile(SPEC_TREE_GRAMMAR.COORDINATION_NOTE.ISSUES)],
    ["PLAN.md", nodeFile(SPEC_TREE_GRAMMAR.COORDINATION_NOTE.PLAN)],
    ["an Outcome record", nodeFile(`${SLUG_SCOPE_NODE_SLUG}${OUTCOME_RECORD_SUFFIX}`)],
    [
      "a Knowledge entry",
      nodeFile(SPEC_TREE_GRAMMAR.KNOWLEDGE.DIRECTORY_NAME, `${SLUG_SCOPE_NODE_SLUG}${MARKDOWN_EXTENSION}`),
    ],
    ["a file in docs/", [DOCS_DIRECTORY, `${SLUG_SCOPE_NODE_SLUG}${MARKDOWN_EXTENSION}`].join(SPEC_TREE_GRAMMAR.PATH_SEPARATOR)],
  ];
}
