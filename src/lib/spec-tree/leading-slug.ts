/** One word of a slug: a lowercase letter, then lowercase letters and digits. */
const SLUG_WORD_SOURCE = "[a-z][a-z0-9]*";

/** The methodology's slug grammar: lowercase words joined by single hyphens, each word opening with a letter. */
export const SPEC_TREE_SLUG_SOURCE = `${SLUG_WORD_SOURCE}(?:-${SLUG_WORD_SOURCE})*`;

/** The headings whose subsection carries the slug the heading names. */
export const SPEC_TREE_SLUG_HEADING_TYPE = {
  MAPPING: "Test.Mapping",
  EVALUATE: "Evaluate",
} as const;

/** Where a leading slug opens: on a row, or on a Mapping or Evaluate heading. */
export const SPEC_TREE_LEADING_SLUG_SITE = {
  ROW: "row",
  HEADING: "heading",
} as const;

export type SpecTreeLeadingSlugSite = (typeof SPEC_TREE_LEADING_SLUG_SITE)[keyof typeof SPEC_TREE_LEADING_SLUG_SITE];

/** The leading slug one line of a node spec or decision record opens, with the link target when the slug is a link's text. */
export type SpecTreeLeadingSlug = {
  /** The line's number, counting from 1. */
  readonly line: number;
  readonly slug: string;
  readonly site: SpecTreeLeadingSlugSite;
  readonly href?: string;
};

const SLUG_GROUP = {
  LINKED: "linkedSlug",
  HREF: "href",
  PLAIN: "plainSlug",
} as const;

const LINE_BREAK_PATTERN = /\r?\n/u;
const ROW_BULLET = "- ";
const LINE_NUMBER_BASE = 1;

function escapeRegExp(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

const SLUG_OPENING_SOURCE = String
  .raw`(?:\[(?<${SLUG_GROUP.LINKED}>${SPEC_TREE_SLUG_SOURCE})\]\((?<${SLUG_GROUP.HREF}>[^)]*)\)|(?<${SLUG_GROUP.PLAIN}>${SPEC_TREE_SLUG_SOURCE}))`;

/** A row: a list item at the start of its line that opens with a slug, then a colon at the end of the line or before a space. */
const ROW_PATTERN = new RegExp(`^${escapeRegExp(ROW_BULLET)}${SLUG_OPENING_SOURCE}:(?: |$)`, "u");

/** A Mapping or Evaluate heading, which carries the slug of its subsection. */
const SLUG_HEADING_PATTERN = new RegExp(
  String.raw`^#{2,6} (?:${
    Object.values(SPEC_TREE_SLUG_HEADING_TYPE).map(escapeRegExp).join("|")
  }): ${SLUG_OPENING_SOURCE}\s*$`,
  "u",
);

const FENCE_PATTERN = /^\s{0,3}(?<marker>`{3,}|~{3,})/u;

type Fence = { readonly character: string; readonly length: number };

function fenceOf(line: string): Fence | undefined {
  const marker = FENCE_PATTERN.exec(line)?.groups?.marker;
  return marker === undefined ? undefined : { character: marker.charAt(0), length: marker.length };
}

function closesFence(open: Fence, candidate: Fence | undefined, line: string): boolean {
  return candidate !== undefined
    && candidate.character === open.character
    && candidate.length >= open.length
    && line.trim() === line.trim().charAt(0).repeat(line.trim().length);
}

function leadingSlugOf(line: string, lineNumber: number): SpecTreeLeadingSlug | undefined {
  for (
    const [site, pattern] of [
      [SPEC_TREE_LEADING_SLUG_SITE.ROW, ROW_PATTERN],
      [SPEC_TREE_LEADING_SLUG_SITE.HEADING, SLUG_HEADING_PATTERN],
    ] as const
  ) {
    const groups: Readonly<Record<string, string | undefined>> | undefined = pattern.exec(line)?.groups;
    if (groups === undefined) continue;
    const linked = groups[SLUG_GROUP.LINKED];
    if (linked !== undefined) return { line: lineNumber, slug: linked, site, href: groups[SLUG_GROUP.HREF] };
    const plain = groups[SLUG_GROUP.PLAIN];
    if (plain !== undefined) return { line: lineNumber, slug: plain, site };
  }
  return undefined;
}

/**
 * The leading slugs of a node spec or decision record, of either file form, in line order. A row
 * is a list item that starts its line outside a fenced code block and opens with a slug, plain or
 * as the text of a link, then a colon at the end of the line or before a space; a Mapping or
 * Evaluate heading carries the slug of its subsection. Every other line opens no slug, and no line
 * fails the read.
 */
export function readSpecTreeLeadingSlugs(text: string): readonly SpecTreeLeadingSlug[] {
  const slugs: SpecTreeLeadingSlug[] = [];
  let fence: Fence | undefined;
  for (const [index, line] of text.split(LINE_BREAK_PATTERN).entries()) {
    const candidate = fenceOf(line);
    if (fence !== undefined) {
      if (closesFence(fence, candidate, line)) fence = undefined;
      continue;
    }
    if (candidate !== undefined) {
      fence = candidate;
      continue;
    }
    const slug = leadingSlugOf(line, index + LINE_NUMBER_BASE);
    if (slug !== undefined) slugs.push(slug);
  }
  return slugs;
}
