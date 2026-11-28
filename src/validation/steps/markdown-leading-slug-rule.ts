/**
 * Spec-tree leading-slug rule.
 *
 * Under a methodology declaration that selects the 4.0 grammar, every row and every Mapping or
 * Evaluate heading of a node spec or decision record inside `spx/` opens with a leading slug that
 * is unique in its file and is not the reserved word `title`. The rule reads leading slugs through
 * the spec-tree library's reader, reports one error for each line that repeats an earlier leading
 * slug of its file and one for each line whose leading slug is reserved, and admits a row with no
 * leading slug. It judges no other Markdown file, and judges nothing under a declaration that
 * selects only the 3.x grammar.
 *
 * @module validation/steps/markdown-leading-slug-rule
 */

import { relative, resolve, sep } from "node:path";

import { TRACKED_PATH_DIRECTORY_SEPARATOR } from "@/lib/git/tracked-paths";
import { DECISION_SUFFIXES, readSpecTreeLeadingSlugs, SPEC_TREE_CONFIG } from "@/lib/spec-tree";

import type { MarkdownlintCustomRule } from "./markdown-link-shape-rule";

export const MARKDOWN_LEADING_SLUG_RULE_NAME = "spx-leading-slug";

/** Rule configuration keys: the product root, the node-spec paths of the tree, and whether the declaration selects the 4.0 slug rows. */
export const MARKDOWN_LEADING_SLUG_RULE_CONFIG = {
  ROOT_PATH: "root_path",
  NODE_SPEC_PATHS: "node_spec_paths",
  SLUG_ROWS: "slug_rows",
} as const;

/** The leading slug a node spec or decision record never opens a row with. */
export const MARKDOWN_RESERVED_LEADING_SLUG = "title";

export const LEADING_SLUG_DIAGNOSTICS = {
  REPEATED: "repeats the earlier leading slug",
  RESERVED: "is the reserved leading slug",
} as const;

const LINE_BREAK = "\n";
const SPEC_TREE_PREFIX = `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}${TRACKED_PATH_DIRECTORY_SEPARATOR}`;

type LeadingSlugRuleParams = {
  readonly name: string;
  readonly lines: readonly string[];
  readonly config: Readonly<Record<string, unknown>>;
};

function productRelativePath(params: LeadingSlugRuleParams): string | undefined {
  const rootPath = params.config[MARKDOWN_LEADING_SLUG_RULE_CONFIG.ROOT_PATH];
  if (typeof rootPath !== "string") return undefined;
  return relative(rootPath, resolve(params.name)).split(sep).join(TRACKED_PATH_DIRECTORY_SEPARATOR);
}

function isJudgedFile(path: string, config: Readonly<Record<string, unknown>>): boolean {
  if (!path.startsWith(SPEC_TREE_PREFIX)) return false;
  if (DECISION_SUFFIXES.some((suffix) => path.endsWith(suffix))) return true;
  const nodeSpecPaths = config[MARKDOWN_LEADING_SLUG_RULE_CONFIG.NODE_SPEC_PATHS];
  return Array.isArray(nodeSpecPaths) && nodeSpecPaths.includes(path);
}

/** The markdownlint custom rule judging the leading slugs of node specs and decision records. */
export const markdownLeadingSlugRule: MarkdownlintCustomRule = {
  names: [MARKDOWN_LEADING_SLUG_RULE_NAME],
  description: "Node specs and decision records open each row with a unique, unreserved leading slug",
  tags: ["slugs"],
  parser: "none",
  function: (params, onError) => {
    const ruleParams = params as unknown as LeadingSlugRuleParams;
    if (ruleParams.config[MARKDOWN_LEADING_SLUG_RULE_CONFIG.SLUG_ROWS] !== true) return;
    const path = productRelativePath(ruleParams);
    if (path === undefined || !isJudgedFile(path, ruleParams.config)) return;
    const seen = new Set<string>();
    for (const { line, slug } of readSpecTreeLeadingSlugs(ruleParams.lines.join(LINE_BREAK))) {
      if (slug === MARKDOWN_RESERVED_LEADING_SLUG) {
        onError({ lineNumber: line, detail: `${slug} ${LEADING_SLUG_DIAGNOSTICS.RESERVED}` });
      }
      if (seen.has(slug)) {
        onError({ lineNumber: line, detail: `${slug} ${LEADING_SLUG_DIAGNOSTICS.REPEATED}` });
      }
      seen.add(slug);
    }
  },
};
