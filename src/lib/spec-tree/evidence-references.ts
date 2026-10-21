import {
  SPEC_TREE_ASSERTION_BULLET_PREFIX,
  SPEC_TREE_ASSERTIONS_HEADING,
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

/** Reads a link target's text; it rejects when the source holds no such file. */
export type SpecTreeEvidenceTargetReader = (productRelativePath: string) => Promise<unknown>;

const FILE_NOT_FOUND_CODE = "ENOENT";
const LINE_BREAK_PATTERN = /\r?\n/u;

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
} as const;

function escapeRegExp(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

function alternation(values: readonly string[]): string {
  return values.map(escapeRegExp).join("|");
}

/**
 * An evidence tag inside an assertion line: a link whose text names an evidence type, or an audit
 * tag with an optional rule slug that no link target follows.
 */
const EVIDENCE_TAG_PATTERN = new RegExp(
  String.raw`\[(?<${LINK_TAG_GROUP.TEXT}>${
    alternation(Object.values(SPEC_TREE_EVIDENCE_LINK_TEXT))
  })\]\((?<${LINK_TAG_GROUP.HREF}>[^)]*)\)`
    + String.raw`|\[(?<${LINK_TAG_GROUP.AUDIT_TEXT}>${alternation(Object.values(SPEC_TREE_AUDIT_TAG_TEXT))})`
    + String.raw`(?:${escapeRegExp(SPEC_TREE_AUDIT_TAG_SLUG_SEPARATOR)}(?<${LINK_TAG_GROUP.SLUG}>[^\]\s]+))?\](?!\()`,
  "u",
);

function assertionLines(specText: string): readonly string[] {
  const lines = specText.split(LINE_BREAK_PATTERN);
  const start = lines.findIndex((line) => line.trim() === SPEC_TREE_ASSERTIONS_HEADING);
  if (start < 0) return [];
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith(SPEC_TREE_SECTION_HEADING_PREFIX));
  return (end < 0 ? rest : rest.slice(0, end)).filter((line) =>
    line.trimStart().startsWith(SPEC_TREE_ASSERTION_BULLET_PREFIX)
  );
}

function isFileNotFound(error: unknown): boolean {
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

/**
 * The evidence references a node spec declares, one per tagged assertion in order of appearance.
 * A link is keyed by its node-local path and reports whether its target is read; an audit tag is
 * keyed by its rule slug, or unkeyed when it carries none. Two audit tags with one rule slug in
 * one spec fail the read, naming the spec and the slug.
 */
export async function readSpecEvidenceReferences(
  specPath: string,
  specText: string,
  grammar: SpecTreeLinkGrammar,
  readTarget: SpecTreeEvidenceTargetReader,
): Promise<readonly SpecTreeEvidenceReference[]> {
  const references: SpecTreeEvidenceReference[] = [];
  const slugs = new Set<string>();
  for (const line of assertionLines(specText)) {
    const groups: Readonly<Record<string, string | undefined>> | undefined = EVIDENCE_TAG_PATTERN.exec(line)?.groups;
    if (groups === undefined) continue;
    const linkText = groups[LINK_TAG_GROUP.TEXT] as SpecTreeEvidenceLinkText | undefined;
    const href = groups[LINK_TAG_GROUP.HREF];
    if (linkText !== undefined && href !== undefined) {
      const { path, target } = await targetOf(specPath, href, grammar, readTarget);
      references.push({
        verificationType: VERIFICATION_TYPE_OF_LINK_TEXT[linkText],
        key: { kind: SPEC_TREE_EVIDENCE_KEY_KIND.PATH, path },
        target,
      });
      continue;
    }
    const slug = groups[LINK_TAG_GROUP.SLUG];
    if (slug === undefined) {
      references.push({
        verificationType: SPEC_TREE_VERIFICATION_TYPE.AUDIT,
        key: { kind: SPEC_TREE_EVIDENCE_KEY_KIND.UNKEYED },
      });
      continue;
    }
    if (slugs.has(slug)) {
      throw new Error(`${specPath} holds more than one audit tag with the rule slug ${slug}`);
    }
    slugs.add(slug);
    references.push({
      verificationType: SPEC_TREE_VERIFICATION_TYPE.AUDIT,
      key: { kind: SPEC_TREE_EVIDENCE_KEY_KIND.SLUG, slug },
    });
  }
  return references;
}
