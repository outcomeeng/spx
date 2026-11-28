import { type NamingSchemaVersion, SPEC_TREE_ASSERTION_GRAMMAR, SPEC_TREE_GRAMMAR } from "./config";
import { readSpecTreeLeadingSlugs, SPEC_TREE_LEADING_SLUG_SITE, type SpecTreeLeadingSlug } from "./leading-slug";
import {
  SPEC_TREE_ASSERTION_BULLET_PREFIX,
  SPEC_TREE_ASSERTIONS_HEADING,
  SPEC_TREE_AUDIT_LINK,
  SPEC_TREE_AUDIT_TAG_SLUG_SEPARATOR,
  SPEC_TREE_AUDIT_TAG_TEXT,
  SPEC_TREE_EVIDENCE_LINK_TEXT,
  SPEC_TREE_LINK_KIND,
  SPEC_TREE_SECTION_HEADING_PREFIX,
  type SpecTreeEvidenceLinkText,
  type SpecTreeLinkGrammar,
} from "./link-grammar";

/** The verification types an assertion's tag declares. */
export const SPEC_TREE_VERIFICATION_TYPE = {
  TEST: "test",
  EVAL: "eval",
  PROBE: "probe",
  AUDIT: "audit",
} as const;

export type SpecTreeVerificationType = (typeof SPEC_TREE_VERIFICATION_TYPE)[keyof typeof SPEC_TREE_VERIFICATION_TYPE];

/** What identifies an evidence reference: a node-local path, an audit rule slug, or nothing. */
export const SPEC_TREE_EVIDENCE_KEY_KIND = {
  PATH: "path",
  SLUG: "slug",
  UNKEYED: "unkeyed",
} as const;

/** Whether the source reads a link's target. */
export const SPEC_TREE_EVIDENCE_TARGET = {
  RESOLVED: "resolved",
  DANGLING: "dangling",
} as const;

export type SpecTreeEvidenceTarget = (typeof SPEC_TREE_EVIDENCE_TARGET)[keyof typeof SPEC_TREE_EVIDENCE_TARGET];

export type SpecTreeEvidenceKey =
  | { readonly kind: typeof SPEC_TREE_EVIDENCE_KEY_KIND.PATH; readonly path: string }
  | { readonly kind: typeof SPEC_TREE_EVIDENCE_KEY_KIND.SLUG; readonly slug: string }
  | { readonly kind: typeof SPEC_TREE_EVIDENCE_KEY_KIND.UNKEYED };

/** One tagged assertion's declared evidence; a link reference also reports whether its target resolves. */
export type SpecTreeEvidenceReference = {
  readonly verificationType: SpecTreeVerificationType;
  readonly key: SpecTreeEvidenceKey;
  readonly target?: SpecTreeEvidenceTarget;
};

/** Which assertion evidence forms a read takes: tags under the 3.x grammar, slug rows under the 4.0 grammar. */
export type SpecTreeAssertionEvidenceReading = {
  readonly tags: boolean;
  readonly slugRows: boolean;
};

/** The evidence forms the selected naming-schema versions declare. */
export function assertionEvidenceReading(
  selected: readonly NamingSchemaVersion[],
): SpecTreeAssertionEvidenceReading {
  return {
    tags: selected.some((version) => version.assertionGrammar === SPEC_TREE_ASSERTION_GRAMMAR.TAGS),
    slugRows: selected.some((version) => version.assertionGrammar === SPEC_TREE_ASSERTION_GRAMMAR.SLUG_ROWS),
  };
}

const EVERY_ASSERTION_EVIDENCE_FORM: SpecTreeAssertionEvidenceReading = { tags: true, slugRows: true };

/** Reads a link target's text; it rejects when the source holds no such file. */
export type SpecTreeEvidenceTargetReader = (productRelativePath: string) => Promise<unknown>;

const FILE_NOT_FOUND_CODE = "ENOENT";
const LINE_BREAK_PATTERN = /\r?\n/u;
const CODE_SPAN_PATTERN = /`[^`]*`/gu;
const CODE_SPAN_REPLACEMENT = " ";
const TAG_POSITION_TAIL_PATTERN = /^\)?\.?\s*$/u;

const VERIFICATION_TYPE_OF_LINK_TEXT: Readonly<Record<SpecTreeEvidenceLinkText, SpecTreeVerificationType>> = {
  [SPEC_TREE_EVIDENCE_LINK_TEXT.TEST]: SPEC_TREE_VERIFICATION_TYPE.TEST,
  [SPEC_TREE_EVIDENCE_LINK_TEXT.EVAL]: SPEC_TREE_VERIFICATION_TYPE.EVAL,
  [SPEC_TREE_EVIDENCE_LINK_TEXT.PROBE]: SPEC_TREE_VERIFICATION_TYPE.PROBE,
};

const LINK_TAG_GROUP = {
  TEXT: "linkText",
  HREF: "href",
  AUDIT_TEXT: "auditText",
  SLUG: "slug",
  AUDIT_LINK_TEXT: "auditLinkText",
  AUDIT_HREF: "auditHref",
} as const;

function escapeRegExp(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

function alternation(values: readonly string[]): string {
  return values.map(escapeRegExp).join("|");
}

/**
 * An evidence tag inside an assertion line: a link whose text names an evidence type, an `audit`
 * link to the file that names its rule slug, or an audit tag with an optional rule slug that no
 * link target follows. Code-span content is excluded before matching.
 */
const EVIDENCE_TAG_PATTERN = new RegExp(
  String.raw`\[(?<${LINK_TAG_GROUP.TEXT}>${
    alternation(Object.values(SPEC_TREE_EVIDENCE_LINK_TEXT))
  })\]\((?<${LINK_TAG_GROUP.HREF}>[^)]*)\)`
    + String.raw`|\[(?<${LINK_TAG_GROUP.AUDIT_LINK_TEXT}>${
      escapeRegExp(SPEC_TREE_AUDIT_TAG_TEXT.CURRENT)
    })\]\((?<${LINK_TAG_GROUP.AUDIT_HREF}>[^)]*)\)`
    + String.raw`|\[(?<${LINK_TAG_GROUP.AUDIT_TEXT}>${alternation(Object.values(SPEC_TREE_AUDIT_TAG_TEXT))})`
    + String.raw`(?:${escapeRegExp(SPEC_TREE_AUDIT_TAG_SLUG_SEPARATOR)}(?<${LINK_TAG_GROUP.SLUG}>[^\]\s]+))?\](?!\()`,
  "gu",
);

function withoutCodeSpans(line: string): string {
  return line.replaceAll(CODE_SPAN_PATTERN, CODE_SPAN_REPLACEMENT);
}

type TagGroups = Readonly<Record<string, string | undefined>>;

type SectionLine = { readonly lineNumber: number; readonly text: string };

const LINE_NUMBER_BASE = 1;
const HEADING_PATTERN = /^#{1,6} /u;
const AUDIT_GROUP_HEADING_PATTERN = /^#{1,6} Audit(?:: .+)?\s*$/u;

/**
 * The lines of the Assertions section, each with its line number in the spec. A level-2 heading
 * that reads `Audit` or `Audit: <subject>` opens an Audit group of the section; any other level-2
 * heading ends it.
 */
function assertionSectionLines(specText: string): readonly SectionLine[] {
  const lines = specText.split(LINE_BREAK_PATTERN);
  const start = lines.findIndex((line) => line.trim() === SPEC_TREE_ASSERTIONS_HEADING);
  if (start < 0) return [];
  const section: SectionLine[] = [];
  for (let index = start + 1; index < lines.length; index++) {
    const text = lines[index] ?? "";
    if (text.startsWith(SPEC_TREE_SECTION_HEADING_PREFIX) && !AUDIT_GROUP_HEADING_PATTERN.test(text)) break;
    section.push({ lineNumber: index + LINE_NUMBER_BASE, text });
  }
  return section;
}

function isAssertionRow(text: string): boolean {
  return text.trimStart().startsWith(SPEC_TREE_ASSERTION_BULLET_PREFIX);
}

const VERIFICATION_TYPE_OF_EVIDENCE_DIRECTORY: Readonly<Record<string, SpecTreeVerificationType>> = {
  [SPEC_TREE_GRAMMAR.EVIDENCE.DIRECTORY_NAME]: SPEC_TREE_VERIFICATION_TYPE.TEST,
  [SPEC_TREE_GRAMMAR.EVAL.DIRECTORY_NAME]: SPEC_TREE_VERIFICATION_TYPE.EVAL,
  [SPEC_TREE_GRAMMAR.PROBE.DIRECTORY_NAME]: SPEC_TREE_VERIFICATION_TYPE.PROBE,
};

/**
 * The real evidence tags of one assertion line. A pathless audit tag counts only in the tag
 * position at the end of the line; a link tag and a slugged audit tag count anywhere outside a code span.
 */
function evidenceTagGroups(line: string, reading: SpecTreeAssertionEvidenceReading): readonly TagGroups[] {
  const text = withoutCodeSpans(line);
  return [...text.matchAll(EVIDENCE_TAG_PATTERN)]
    .filter((match) => {
      const groups: TagGroups = match.groups ?? {};
      const auditTag = groups[LINK_TAG_GROUP.AUDIT_TEXT] !== undefined;
      const auditLink = groups[LINK_TAG_GROUP.AUDIT_LINK_TEXT] !== undefined;
      if ((auditTag || auditLink) && !reading.tags) return false;
      const pathless = auditTag && groups[LINK_TAG_GROUP.SLUG] === undefined;
      return !pathless || TAG_POSITION_TAIL_PATTERN.test(text.slice(match.index + match[0].length));
    })
    .map((match): TagGroups => match.groups ?? {});
}

/** Whether a read rejection is a file-not-found rejection. */
export function isFileNotFound(error: unknown): boolean {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === FILE_NOT_FOUND_CODE;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function targetOf(
  specPath: string,
  href: string,
  grammar: SpecTreeLinkGrammar,
  readTarget: SpecTreeEvidenceTargetReader,
): Promise<{ readonly path: string; readonly target: SpecTreeEvidenceTarget }> {
  const link = grammar.parseSpecTreeLink(href);
  const resolved = link.kind === SPEC_TREE_LINK_KIND.NODE_LOCAL ? grammar.resolveSpecTreeLink(specPath, link) : null;
  if (resolved === null) return { path: link.path, target: SPEC_TREE_EVIDENCE_TARGET.DANGLING };
  const present = await readTarget(resolved).then(() => true, (error: unknown) => {
    if (isFileNotFound(error)) return false;
    throw new Error(`${specPath} link target ${link.path} cannot be read: ${errorMessage(error)}`, {
      cause: error,
    });
  });
  return {
    path: link.path,
    target: present ? SPEC_TREE_EVIDENCE_TARGET.RESOLVED : SPEC_TREE_EVIDENCE_TARGET.DANGLING,
  };
}

async function tagReference(
  specPath: string,
  groups: TagGroups,
  grammar: SpecTreeLinkGrammar,
  readTarget: SpecTreeEvidenceTargetReader,
  auditSlugs: Set<string>,
): Promise<SpecTreeEvidenceReference> {
  const linkText = groups[LINK_TAG_GROUP.TEXT] as SpecTreeEvidenceLinkText | undefined;
  const href = groups[LINK_TAG_GROUP.HREF];
  if (linkText !== undefined && href !== undefined) {
    const { path, target } = await targetOf(specPath, href, grammar, readTarget);
    return {
      verificationType: VERIFICATION_TYPE_OF_LINK_TEXT[linkText],
      key: { kind: SPEC_TREE_EVIDENCE_KEY_KIND.PATH, path },
      target,
    };
  }
  const auditHref = groups[LINK_TAG_GROUP.AUDIT_HREF];
  const slug = auditHref === undefined ? groups[LINK_TAG_GROUP.SLUG] : ruleSlugOfAuditLink(auditHref);
  if (slug === undefined) {
    return { verificationType: SPEC_TREE_VERIFICATION_TYPE.AUDIT, key: { kind: SPEC_TREE_EVIDENCE_KEY_KIND.UNKEYED } };
  }
  if (auditSlugs.has(slug)) {
    throw new Error(`${specPath} holds more than one audit tag with the rule slug ${slug}`);
  }
  auditSlugs.add(slug);
  return { verificationType: SPEC_TREE_VERIFICATION_TYPE.AUDIT, key: { kind: SPEC_TREE_EVIDENCE_KEY_KIND.SLUG, slug } };
}

/**
 * The rule slug an `audit` link names: the file name of its target in `audits/` without the `.md`
 * extension, or none when the target is no such file.
 */
function ruleSlugOfAuditLink(href: string): string | undefined {
  const segments = href.split(SPEC_TREE_GRAMMAR.PATH_SEPARATOR);
  const fileName = segments.at(-1) ?? "";
  if (segments.at(-2) !== SPEC_TREE_AUDIT_LINK.DIRECTORY_NAME || !fileName.endsWith(SPEC_TREE_AUDIT_LINK.EXTENSION)) {
    return undefined;
  }
  const slug = fileName.slice(0, -SPEC_TREE_AUDIT_LINK.EXTENSION.length);
  return slug.length > 0 ? slug : undefined;
}

/**
 * The reference a 4.0 row or Mapping or Evaluate heading declares by its leading slug: a slug
 * linked into a node's test, eval, or probe lane maps to a reference of that type keyed by its
 * node-local path, and a plain slug of a row under an `Audit` or `Audit: <subject>` group heading
 * maps to an audit reference keyed by that slug.
 */
async function slugRowReference(
  specPath: string,
  leadingSlug: SpecTreeLeadingSlug,
  groupHeading: string | undefined,
  grammar: SpecTreeLinkGrammar,
  readTarget: SpecTreeEvidenceTargetReader,
): Promise<SpecTreeEvidenceReference | undefined> {
  if (leadingSlug.href !== undefined) {
    const lane = grammar.parseSpecTreeLink(leadingSlug.href).path.split(SPEC_TREE_GRAMMAR.PATH_SEPARATOR).at(0);
    const verificationType = lane === undefined ? undefined : VERIFICATION_TYPE_OF_EVIDENCE_DIRECTORY[lane];
    if (verificationType === undefined) return undefined;
    const { path, target } = await targetOf(specPath, leadingSlug.href, grammar, readTarget);
    return { verificationType, key: { kind: SPEC_TREE_EVIDENCE_KEY_KIND.PATH, path }, target };
  }
  const underAuditGroup = groupHeading !== undefined && AUDIT_GROUP_HEADING_PATTERN.test(groupHeading);
  if (leadingSlug.site !== SPEC_TREE_LEADING_SLUG_SITE.ROW || !underAuditGroup) return undefined;
  return {
    verificationType: SPEC_TREE_VERIFICATION_TYPE.AUDIT,
    key: { kind: SPEC_TREE_EVIDENCE_KEY_KIND.SLUG, slug: leadingSlug.slug },
  };
}

/**
 * The evidence references a node spec declares, in order of appearance, at most one per line of
 * its Assertions section. An assertion line's first real evidence tag gives its reference: a link
 * is keyed by its node-local path and reports whether its target is read; an audit tag, read only
 * under a 3.x grammar, is keyed by its rule slug, or unkeyed when it carries none. A line with no
 * such tag gives, under a 4.0 grammar, the reference its leading slug declares. Two audit tags
 * with one rule slug in one spec fail the read, naming the spec and the slug.
 */
export async function readSpecEvidenceReferences(
  specPath: string,
  specText: string,
  grammar: SpecTreeLinkGrammar,
  readTarget: SpecTreeEvidenceTargetReader,
  reading: SpecTreeAssertionEvidenceReading = EVERY_ASSERTION_EVIDENCE_FORM,
): Promise<readonly SpecTreeEvidenceReference[]> {
  const references: SpecTreeEvidenceReference[] = [];
  const auditSlugs = new Set<string>();
  const leadingSlugByLine = new Map(
    reading.slugRows ? readSpecTreeLeadingSlugs(specText).map((slug) => [slug.line, slug] as const) : [],
  );
  let groupHeading: string | undefined;
  for (const { lineNumber, text } of assertionSectionLines(specText)) {
    if (HEADING_PATTERN.test(text)) groupHeading = text.trim();
    const groups = isAssertionRow(text) ? evidenceTagGroups(text, reading).at(0) : undefined;
    if (groups !== undefined) {
      references.push(await tagReference(specPath, groups, grammar, readTarget, auditSlugs));
      continue;
    }
    const leadingSlug = leadingSlugByLine.get(lineNumber);
    if (leadingSlug === undefined) continue;
    const reference = await slugRowReference(specPath, leadingSlug, groupHeading, grammar, readTarget);
    if (reference !== undefined) references.push(reference);
  }
  return references;
}
