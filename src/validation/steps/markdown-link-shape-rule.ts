/**
 * Spec-tree markdown link-shape rule.
 *
 * Inside the spec tree a link takes one of two shapes: node-local (a relative
 * path that stays inside the citing node) or tree-absolute (a path written
 * literally from the spec-tree root). This rule reports every other shape and
 * every decision path written as text instead of as a link, then hands the
 * admitted links to `markdownlint-rule-relative-links` for existence and
 * heading-fragment checks, presenting each tree-absolute href as anchored at
 * the product root.
 *
 * @module validation/steps/markdown-link-shape-rule
 */

import {
  DECISION_SUFFIXES,
  recognizeSpecTreeFilesystemEntry,
  SPEC_TREE_CONFIG,
  SPEC_TREE_ENTRY_TYPE,
  SPEC_TREE_FILESYSTEM_RECORD_TYPE,
  SPEC_TREE_GRAMMAR,
} from "@/lib/spec-tree";

import relativeLinksRule from "markdownlint-rule-relative-links";

// =============================================================================
// CONSTANTS
// =============================================================================

export const MARKDOWN_LINK_SHAPE_RULE_NAME = "spx-link-shape";

/** Diagnostic suffixes, each following the quoted offending link or path. */
export const MARKDOWN_LINK_SHAPE_DIAGNOSTICS = {
  PARENT_CLIMB: "should not climb with a parent-directory segment; use a node-local or tree-absolute link",
  LEADING_SLASH: "should not start with a slash; write the path from the spec tree root",
  DESCENDANT_NODE: "should not enter a descendant node's directory; use a tree-absolute link",
  DECISION_PATH_TEXT: "is a decision path written as text; cite it with a link",
} as const;

const LINK_TOKEN_TYPE = {
  INLINE: "inline",
  LINK_OPEN: "link_open",
  LINK_CLOSE: "link_close",
  IMAGE: "image",
  TEXT: "text",
  CODE_INLINE: "code_inline",
} as const;

const LINK_TARGET_ATTRIBUTE = {
  [LINK_TOKEN_TYPE.LINK_OPEN]: "href",
  [LINK_TOKEN_TYPE.IMAGE]: "src",
} as const;

const FRAGMENT_PREFIX = "#";
const ROOT_ANCHOR = "/";
const PARENT_DIRECTORY_SEGMENT = "..";
const CURRENT_DIRECTORY_SEGMENT = ".";
const URL_SCHEME_PATTERN = /^[A-Za-z][A-Za-z0-9+.-]*:/;
const PATH_SUFFIX_PATTERN = /[?#]/;

function escapeRegExp(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

/**
 * A tree-rooted decision path inside prose: it starts at the spec-tree root,
 * ends in a decision suffix, and may be followed by sentence punctuation, but
 * not by further path characters (`….adr.mdx`, `….adr.md.bak`).
 */
const DECISION_PATH_TEXT_PATTERN = new RegExp(
  String.raw`(?<![A-Za-z0-9._/-])${escapeRegExp(SPEC_TREE_CONFIG.ROOT_DIRECTORY)}/[A-Za-z0-9._/-]*?(?:${
    DECISION_SUFFIXES.map(escapeRegExp).join("|")
  })(?![A-Za-z0-9_/-]|\.[A-Za-z0-9])`,
  "g",
);

// =============================================================================
// TYPES
// =============================================================================

/** The subset of a markdown-it token this rule reads and rewrites. */
interface MarkdownItToken {
  readonly type: string;
  readonly content: string;
  readonly lineNumber: number;
  readonly attrs?: ReadonlyArray<readonly [string, string]> | null;
  readonly children?: readonly MarkdownItToken[] | null;
}

/** The subset of markdownlint rule parameters this rule reads. */
interface MarkdownlintRuleParams {
  readonly name: string;
  readonly config: Readonly<Record<string, unknown>>;
  readonly parsers: { readonly markdownit: { readonly tokens: readonly MarkdownItToken[] } };
}

interface MarkdownlintRuleError {
  readonly lineNumber: number;
  readonly detail?: string;
}

type MarkdownlintOnError = (error: MarkdownlintRuleError) => void;

/** A markdownlint custom rule that receives markdown-it tokens. */
export interface MarkdownlintCustomRule {
  readonly names: string[];
  readonly description: string;
  readonly tags: string[];
  readonly parser: string;
  readonly function: (params: MarkdownlintRuleParams, onError: MarkdownlintOnError) => void;
}

type LinkTokenType = keyof typeof LINK_TARGET_ATTRIBUTE;

type LinkShapeDiagnostic = (typeof MARKDOWN_LINK_SHAPE_DIAGNOSTICS)[keyof typeof MARKDOWN_LINK_SHAPE_DIAGNOSTICS];

// =============================================================================
// LINK CLASSIFICATION
// =============================================================================

function isLinkTokenType(type: string): type is LinkTokenType {
  return Object.hasOwn(LINK_TARGET_ATTRIBUTE, type);
}

function linkTarget(token: MarkdownItToken): string | undefined {
  if (!isLinkTokenType(token.type)) return undefined;
  const attribute = LINK_TARGET_ATTRIBUTE[token.type];
  return token.attrs?.find(([name]) => name === attribute)?.[1];
}

function isTreeAbsolute(href: string): boolean {
  return href.startsWith(`${SPEC_TREE_CONFIG.ROOT_DIRECTORY}${SPEC_TREE_GRAMMAR.PATH_SEPARATOR}`);
}

function pathSegments(href: string): string[] {
  const [path = ""] = href.split(PATH_SUFFIX_PATTERN);
  return path.split(SPEC_TREE_GRAMMAR.PATH_SEPARATOR).filter((segment) => segment.length > 0);
}

function isNodeDirectoryName(segment: string): boolean {
  const entry = recognizeSpecTreeFilesystemEntry({
    type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.DIRECTORY,
    relativePath: segment,
  });
  return entry?.type === SPEC_TREE_ENTRY_TYPE.NODE || entry?.type === SPEC_TREE_ENTRY_TYPE.SUPERSEDED;
}

function entersDescendantNode(href: string): boolean {
  const firstSegment = pathSegments(href).find((segment) => segment !== CURRENT_DIRECTORY_SEGMENT);
  return firstSegment !== undefined && isNodeDirectoryName(firstSegment);
}

/**
 * Classifies a link target against the spec-tree link grammar.
 *
 * Returns the diagnostic for a rejected shape, or `undefined` for a target the
 * grammar admits or does not govern (a fragment-only target or a URL).
 */
export function classifySpecTreeLinkShape(href: string): LinkShapeDiagnostic | undefined {
  if (href.startsWith(FRAGMENT_PREFIX) || URL_SCHEME_PATTERN.test(href)) return undefined;
  if (href.startsWith(ROOT_ANCHOR)) return MARKDOWN_LINK_SHAPE_DIAGNOSTICS.LEADING_SLASH;
  if (pathSegments(href).includes(PARENT_DIRECTORY_SEGMENT)) return MARKDOWN_LINK_SHAPE_DIAGNOSTICS.PARENT_CLIMB;
  if (isTreeAbsolute(href)) return undefined;
  if (entersDescendantNode(href)) return MARKDOWN_LINK_SHAPE_DIAGNOSTICS.DESCENDANT_NODE;
  return undefined;
}

function quoted(value: string): string {
  return `"${value}"`;
}

// =============================================================================
// RULE
// =============================================================================

/**
 * Rewrites one inline token's children for the composed relative-links check:
 * rejected-shape links are withheld, and each tree-absolute href is anchored at
 * the product root. Returns the rewritten children and the anchored-to-written
 * href map that restores diagnostics to the link as written.
 */
function presentAdmittedLinks(
  children: readonly MarkdownItToken[],
  anchoredHrefs: Map<string, string>,
): MarkdownItToken[] {
  return children.flatMap((child) => {
    const href = linkTarget(child);
    if (href === undefined || !isLinkTokenType(child.type)) return [child];
    if (classifySpecTreeLinkShape(href) !== undefined) return [];
    if (!isTreeAbsolute(href)) return [child];

    const anchored = `${ROOT_ANCHOR}${href}`;
    anchoredHrefs.set(quoted(anchored), quoted(href));
    const attribute = LINK_TARGET_ATTRIBUTE[child.type];
    return [{
      ...child,
      attrs: (child.attrs ?? []).map((
        [name, value],
      ) => (name === attribute ? [name, anchored] as const : [name, value])),
    }];
  });
}

function reportShapeAndTextViolations(token: MarkdownItToken, onError: MarkdownlintOnError): void {
  let linkDepth = 0;
  for (const child of token.children ?? []) {
    if (child.type === LINK_TOKEN_TYPE.LINK_CLOSE) {
      linkDepth = Math.max(0, linkDepth - 1);
      continue;
    }

    const href = linkTarget(child);
    if (href !== undefined) {
      const diagnostic = classifySpecTreeLinkShape(href);
      if (diagnostic !== undefined) {
        onError({ lineNumber: child.lineNumber, detail: `${quoted(href)} ${diagnostic}` });
      }
    }
    if (child.type === LINK_TOKEN_TYPE.LINK_OPEN) {
      linkDepth += 1;
      continue;
    }

    if (linkDepth > 0 || (child.type !== LINK_TOKEN_TYPE.TEXT && child.type !== LINK_TOKEN_TYPE.CODE_INLINE)) {
      continue;
    }
    for (const [decisionPath] of child.content.matchAll(DECISION_PATH_TEXT_PATTERN)) {
      onError({
        lineNumber: child.lineNumber,
        detail: `${quoted(decisionPath)} ${MARKDOWN_LINK_SHAPE_DIAGNOSTICS.DECISION_PATH_TEXT}`,
      });
    }
  }
}

function restoreWrittenHref(
  detail: string | undefined,
  anchoredHrefs: ReadonlyMap<string, string>,
): string | undefined {
  if (detail === undefined) return undefined;
  for (const [anchored, written] of anchoredHrefs) {
    if (detail.startsWith(anchored)) return `${written}${detail.slice(anchored.length)}`;
  }
  return detail;
}

/**
 * The markdownlint custom rule enforcing the spec-tree link grammar. Its rule
 * configuration carries the product root as `root_path`, which the composed
 * relative-links check uses to resolve tree-absolute hrefs.
 */
export const markdownLinkShapeRule: MarkdownlintCustomRule = {
  names: [MARKDOWN_LINK_SHAPE_RULE_NAME],
  description: "Spec-tree links should be node-local or tree-absolute and should exist",
  tags: ["links"],
  parser: "markdownit",
  function: (params, onError) => {
    const anchoredHrefs = new Map<string, string>();
    const presentedTokens = params.parsers.markdownit.tokens.map((token) => {
      if (token.type !== LINK_TOKEN_TYPE.INLINE) return token;
      reportShapeAndTextViolations(token, onError);
      return { ...token, children: presentAdmittedLinks(token.children ?? [], anchoredHrefs) };
    });

    relativeLinksRule.function(
      {
        ...params,
        parsers: { ...params.parsers, markdownit: { ...params.parsers.markdownit, tokens: presentedTokens } },
      } as Parameters<typeof relativeLinksRule.function>[0],
      (error: MarkdownlintRuleError) => {
        onError({ ...error, detail: restoreWrittenHref(error.detail, anchoredHrefs) });
      },
    );
  },
};
