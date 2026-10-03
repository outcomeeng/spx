/**
 * Spec-tree markdown link-shape rule.
 *
 * Inside the spec tree a link takes one of the two shapes the spec-tree link
 * grammar admits: node-local (a relative path that stays inside the citing
 * node) or tree-absolute (a path written literally from the spec-tree root).
 * This rule reports every shape the grammar rejects. When
 * the rule configuration carries the repository's tracked paths, it also
 * reports an admitted link whose target the repository does not track as
 * broken, and a tracked decision's path written as text instead of as a link;
 * without tracked paths, no text is a decision path. The remaining
 * admitted links go to `markdownlint-rule-relative-links` for existence and
 * heading-fragment checks, with each tree-absolute href presented as anchored
 * at the product root.
 *
 * @module validation/steps/markdown-link-shape-rule
 */

import { posix, relative, resolve, sep } from "node:path";

import { createTrackedPathInclusion, TRACKED_PATH_DIRECTORY_SEPARATOR } from "@/lib/git/tracked-paths";
import {
  decisionPathsWrittenAsText,
  parseSpecTreeLink,
  resolveSpecTreeLink,
  SPEC_TREE_GRAMMAR,
  SPEC_TREE_LINK_KIND,
  SPEC_TREE_LINK_PARENT_SEGMENT,
  SPEC_TREE_LINK_ROOT_ANCHOR,
  type SpecTreeLinkKind,
} from "@/lib/spec-tree";

import relativeLinksRule from "markdownlint-rule-relative-links";

// =============================================================================
// CONSTANTS
// =============================================================================

export const MARKDOWN_LINK_SHAPE_RULE_NAME = "spx-link-shape";

/** Rule configuration keys: the product root and the repository's tracked product-relative paths. */
export const MARKDOWN_LINK_SHAPE_RULE_CONFIG = {
  ROOT_PATH: "root_path",
  TRACKED_PATHS: "tracked_paths",
} as const;

/** Diagnostic suffixes, each following the quoted offending link or path. */
export const MARKDOWN_LINK_SHAPE_DIAGNOSTICS = {
  PARENT_CLIMB: "should not climb with a parent-directory segment; use a node-local or tree-absolute link",
  LEADING_SLASH: "should not start with a slash; write the path from the spec tree root",
  DESCENDANT_NODE: "should not enter a descendant node's directory; use a tree-absolute link",
  DECISION_PATH_TEXT: "is a decision path written as text; cite it with a link",
  UNTRACKED_TARGET: "should resolve to a file the repository tracks",
} as const;

const LINK_TOKEN_TYPE = {
  INLINE: "inline",
  LINK_OPEN: "link_open",
  LINK_CLOSE: "link_close",
  IMAGE: "image",
  TEXT: "text",
  CODE_INLINE: "code_inline",
} as const;

/**
 * Block tokens whose raw content markdown-it emits with no inline children: an
 * indented code block and an HTML block. A fenced code block (`fence`) is
 * absent because a decision path inside it is not checked.
 */
const RAW_TEXT_BLOCK_TOKEN_TYPES: ReadonlySet<string> = new Set(["code_block", "html_block"]);

const BLOCK_LINE_SEPARATOR = "\n";
/** An HTML tag, whose attributes are markup rather than text. */
const HTML_TAG_PATTERN = /<[^>]*>/gu;
const NON_LINE_BREAK_PATTERN = /[^\n]/gu;
const MARKUP_BLANK = " ";

const LINK_TARGET_ATTRIBUTE = {
  [LINK_TOKEN_TYPE.LINK_OPEN]: "href",
  [LINK_TOKEN_TYPE.IMAGE]: "src",
} as const;

const CURRENT_DIRECTORY_SEGMENT = ".";
const TRAILING_SEPARATORS_PATTERN = /\/+$/u;
const PARENT_RELATIVE_PREFIX = `${SPEC_TREE_LINK_PARENT_SEGMENT}${SPEC_TREE_GRAMMAR.PATH_SEPARATOR}`;

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

/** The diagnostic each link shape the spec-tree link grammar rejects reports. */
const REJECTED_SHAPE_DIAGNOSTIC: Partial<Record<SpecTreeLinkKind, LinkShapeDiagnostic>> = {
  [SPEC_TREE_LINK_KIND.ROOT_ANCHORED]: MARKDOWN_LINK_SHAPE_DIAGNOSTICS.LEADING_SLASH,
  [SPEC_TREE_LINK_KIND.PARENT_CLIMB]: MARKDOWN_LINK_SHAPE_DIAGNOSTICS.PARENT_CLIMB,
  [SPEC_TREE_LINK_KIND.DESCENDANT_NODE]: MARKDOWN_LINK_SHAPE_DIAGNOSTICS.DESCENDANT_NODE,
};

/**
 * Classifies a link target against the spec-tree link grammar.
 *
 * Returns the diagnostic for a rejected shape, or `undefined` for a target the
 * grammar admits or does not govern (a fragment-only target or a URL).
 */
export function classifySpecTreeLinkShape(href: string): LinkShapeDiagnostic | undefined {
  return REJECTED_SHAPE_DIAGNOSTIC[parseSpecTreeLink(href).kind];
}

function quoted(value: string): string {
  return `"${value}"`;
}

// =============================================================================
// TRACKED TARGETS
// =============================================================================

type TrackedTargetInclusion = (productRelativePath: string) => boolean;

/** The repository's tracked files, and the inclusion predicate that also admits their ancestor directories. */
interface TrackedSet {
  readonly files: ReadonlySet<string>;
  readonly isTracked: TrackedTargetInclusion;
}

/** Where an admitted link's target resolves and what the repository tracks. */
interface TrackedTargetScope extends TrackedSet {
  /** Product-relative path of the citing file, with `/` separators. */
  readonly citingFile: string;
}

const trackedSetCache = new WeakMap<readonly unknown[], TrackedSet>();

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function trackedSet(trackedPaths: readonly string[]): TrackedSet {
  const cached = trackedSetCache.get(trackedPaths);
  if (cached !== undefined) return cached;
  const files = new Set(trackedPaths);
  const set = { files, isTracked: createTrackedPathInclusion(files) };
  trackedSetCache.set(trackedPaths, set);
  return set;
}

/**
 * The tracked-target scope for one citing file, or `undefined` when the rule
 * configuration names no product root or no tracked paths — outside a git
 * repository, existence alone decides whether a link resolves.
 */
function trackedTargetScope(params: MarkdownlintRuleParams): TrackedTargetScope | undefined {
  const rootPath = params.config[MARKDOWN_LINK_SHAPE_RULE_CONFIG.ROOT_PATH];
  const trackedPaths = params.config[MARKDOWN_LINK_SHAPE_RULE_CONFIG.TRACKED_PATHS];
  if (typeof rootPath !== "string" || !isStringArray(trackedPaths)) return undefined;
  return {
    ...trackedSet(trackedPaths),
    citingFile: relative(rootPath, resolve(params.name)).split(sep).join(TRACKED_PATH_DIRECTORY_SEPARATOR),
  };
}

/**
 * Whether an admitted link's target lies inside the product root and the
 * repository does not track it. A tree-absolute href resolves from the product
 * root and a node-local href from the citing file's directory; a target the
 * grammar does not admit and a target outside the product root are not judged here.
 */
function targetsUntrackedPath(href: string, scope: TrackedTargetScope): boolean {
  const resolved = resolveSpecTreeLink(scope.citingFile, parseSpecTreeLink(href));
  if (resolved === null) return false;
  const productRelative = resolved.replace(TRAILING_SEPARATORS_PATTERN, "");
  if (
    productRelative.length === 0 || productRelative === CURRENT_DIRECTORY_SEGMENT
    || productRelative === SPEC_TREE_LINK_PARENT_SEGMENT || productRelative.startsWith(PARENT_RELATIVE_PREFIX)
    || posix.isAbsolute(productRelative)
  ) {
    return false;
  }
  return !scope.isTracked(productRelative);
}

/** Whether a decision path written as text names a decision the repository tracks. */
function isTrackedDecisionPath(decisionPath: string, scope: TrackedTargetScope | undefined): boolean {
  return scope?.files.has(decisionPath) === true;
}

// =============================================================================
// RULE
// =============================================================================

/**
 * Rewrites one inline token's children for the composed relative-links check:
 * rejected-shape links are withheld, a link whose target the repository does
 * not track is reported and withheld, and each tree-absolute href is anchored
 * at the product root. Returns the rewritten children and the anchored-to-written
 * href map that restores diagnostics to the link as written.
 */
function presentAdmittedLinks(
  children: readonly MarkdownItToken[],
  anchoredHrefs: Map<string, string>,
  trackedScope: TrackedTargetScope | undefined,
  onError: MarkdownlintOnError,
): MarkdownItToken[] {
  return children.flatMap((child) => {
    const href = linkTarget(child);
    if (href === undefined || !isLinkTokenType(child.type)) return [child];
    if (classifySpecTreeLinkShape(href) !== undefined) return [];
    if (trackedScope !== undefined && targetsUntrackedPath(href, trackedScope)) {
      onError({
        lineNumber: child.lineNumber,
        detail: `${quoted(href)} ${MARKDOWN_LINK_SHAPE_DIAGNOSTICS.UNTRACKED_TARGET}`,
      });
      return [];
    }
    if (parseSpecTreeLink(href).kind !== SPEC_TREE_LINK_KIND.TREE_ABSOLUTE) return [child];

    const anchored = `${SPEC_TREE_LINK_ROOT_ANCHOR}${href}`;
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

function reportShapeAndTextViolations(
  token: MarkdownItToken,
  trackedScope: TrackedTargetScope | undefined,
  onError: MarkdownlintOnError,
): void {
  let linkDepth = 0;
  for (const child of token.children ?? []) {
    if (child.type === LINK_TOKEN_TYPE.LINK_CLOSE) {
      linkDepth = Math.max(0, linkDepth - 1);
      continue;
    }

    reportRejectedShape(child, onError);
    if (child.type === LINK_TOKEN_TYPE.LINK_OPEN) {
      linkDepth += 1;
      continue;
    }

    if (linkDepth === 0) reportDecisionPathText(child, trackedScope, onError);
  }
}

function reportRejectedShape(child: MarkdownItToken, onError: MarkdownlintOnError): void {
  const href = linkTarget(child);
  if (href === undefined) return;
  const diagnostic = classifySpecTreeLinkShape(href);
  if (diagnostic !== undefined) {
    onError({ lineNumber: child.lineNumber, detail: `${quoted(href)} ${diagnostic}` });
  }
}

function reportTrackedDecisionPaths(
  text: string,
  lineNumber: number,
  trackedScope: TrackedTargetScope | undefined,
  onError: MarkdownlintOnError,
): void {
  for (const decisionPath of decisionPathsWrittenAsText(text)) {
    if (!isTrackedDecisionPath(decisionPath, trackedScope)) continue;
    onError({ lineNumber, detail: `${quoted(decisionPath)} ${MARKDOWN_LINK_SHAPE_DIAGNOSTICS.DECISION_PATH_TEXT}` });
  }
}

/** Reports each tracked decision's path a text or inline-code token outside a link writes as text. */
function reportDecisionPathText(
  child: MarkdownItToken,
  trackedScope: TrackedTargetScope | undefined,
  onError: MarkdownlintOnError,
): void {
  if (child.type !== LINK_TOKEN_TYPE.TEXT && child.type !== LINK_TOKEN_TYPE.CODE_INLINE) return;
  reportTrackedDecisionPaths(child.content, child.lineNumber, trackedScope, onError);
}

/** Blanks every HTML tag while keeping its line breaks, so only the text between tags remains. */
function withoutHtmlMarkup(content: string): string {
  return content.replace(HTML_TAG_PATTERN, (tag) => tag.replace(NON_LINE_BREAK_PATTERN, MARKUP_BLANK));
}

/**
 * Reports each tracked decision's path an indented code block or an HTML block
 * writes as text, on the source line that carries it. An HTML block's tags are
 * markup, so a path inside a tag's attribute is not text.
 */
function reportRawTextBlockDecisionPaths(
  token: MarkdownItToken,
  trackedScope: TrackedTargetScope | undefined,
  onError: MarkdownlintOnError,
): void {
  if (!RAW_TEXT_BLOCK_TOKEN_TYPES.has(token.type)) return;
  withoutHtmlMarkup(token.content).split(BLOCK_LINE_SEPARATOR).forEach((line, offset) => {
    reportTrackedDecisionPaths(line, token.lineNumber + offset, trackedScope, onError);
  });
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
 * relative-links check uses to resolve tree-absolute hrefs, and, inside a git
 * repository, the tracked product-relative paths as `tracked_paths`.
 */
export const markdownLinkShapeRule: MarkdownlintCustomRule = {
  names: [MARKDOWN_LINK_SHAPE_RULE_NAME],
  description: "Spec-tree links should be node-local or tree-absolute and should exist",
  tags: ["links"],
  parser: "markdownit",
  function: (params, onError) => {
    const anchoredHrefs = new Map<string, string>();
    const trackedScope = trackedTargetScope(params);
    const presentedTokens = params.parsers.markdownit.tokens.map((token) => {
      reportRawTextBlockDecisionPaths(token, trackedScope, onError);
      if (token.type !== LINK_TOKEN_TYPE.INLINE) return token;
      reportShapeAndTextViolations(token, trackedScope, onError);
      return {
        ...token,
        children: presentAdmittedLinks(token.children ?? [], anchoredHrefs, trackedScope, onError),
      };
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
