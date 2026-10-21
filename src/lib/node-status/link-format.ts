import { posix } from "node:path";

import { SPEC_TREE_CONFIG, SPEC_TREE_GRAMMAR } from "@/lib/spec-tree";

const MARKDOWN_LINK = /\[([^\]\n]*)\]\(([^)\s]+)(?:\s+"[^"\n]*")?\)/g;
const LINK_LABEL_GROUP = 1;
const LINK_TARGET_GROUP = 2;
const URL_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const TREE_ROOT_PREFIX = `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}${SPEC_TREE_GRAMMAR.PATH_SEPARATOR}`;
const ORDERED_DIRECTORY_NAME = /^\d+(?:\.\d+)?-(.+)\.[a-z]+$/;

/**
 * Whether two versions of a spec differ only in how links are written: every link keeps its label and
 * the tree-absolute path it resolves to, and the text around the links is unchanged.
 */
export function isLinkFormatOnlyEdit(before: string, after: string, specPath: string): boolean {
  return before !== after && normalizeLinks(before, specPath) === normalizeLinks(after, specPath);
}

/** Whether `path` names a node spec: a canonical `{slug}.spec.md`, or the prior `{slug}.md` repeating its directory's slug. */
export function isSpecPath(path: string): boolean {
  if (path.endsWith(SPEC_TREE_GRAMMAR.SPEC_FILE.CANONICAL_SUFFIX)) return true;
  if (!path.endsWith(SPEC_TREE_GRAMMAR.SPEC_FILE.PRIOR_SUFFIX)) return false;
  const slug = ORDERED_DIRECTORY_NAME.exec(posix.basename(posix.dirname(path)))?.[1];
  return slug !== undefined && posix.basename(path, SPEC_TREE_GRAMMAR.SPEC_FILE.PRIOR_SUFFIX) === slug;
}

function normalizeLinks(text: string, specPath: string): string {
  return text.replace(MARKDOWN_LINK, (link: string, ...groups: readonly string[]) => {
    const label = groups[LINK_LABEL_GROUP - 1] ?? "";
    const target = groups[LINK_TARGET_GROUP - 1] ?? "";
    return `[${label}](${resolveTarget(target, specPath)})`;
  });
}

function resolveTarget(target: string, specPath: string): string {
  if (URL_SCHEME.test(target) || target.startsWith("#")) return target;
  if (target.startsWith(TREE_ROOT_PREFIX)) return posix.normalize(target);
  return posix.normalize(posix.join(posix.dirname(specPath), target));
}
