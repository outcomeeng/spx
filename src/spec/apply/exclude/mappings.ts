/**
 * Node path to tool-specific config entry mappings.
 */
import { NODE_SUFFIXES, SPX_PREFIX } from "./constants.js";

/**
 * Convert a node path to a pytest --ignore flag.
 *
 * @example toPytestIgnore("57-subsystems.outcome") => "--ignore=spx/57-subsystems.outcome/"
 */
export function toPytestIgnore(node: string): string {
  return `--ignore=${SPX_PREFIX}${node}/`;
}

/**
 * Escape a string for use in a regular expression.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
}

/**
 * Convert a node path to a mypy exclude regex.
 *
 * @example toMypyRegex("57-subsystems.outcome") => "^spx/57\\-subsystems\\.outcome/"
 */
export function toMypyRegex(node: string): string {
  const escaped = escapeRegex(`${SPX_PREFIX}${node}/`);
  return `^${escaped}`;
}

/**
 * Convert a node path to a pyright exclude path.
 *
 * @example toPyrightPath("57-subsystems.outcome") => "spx/57-subsystems.outcome/"
 */
export function toPyrightPath(node: string): string {
  return `${SPX_PREFIX}${node}/`;
}

/**
 * Check if a config value was generated from an excluded spec-tree node.
 *
 * Detects entries by value pattern (contains a node-type suffix and spx/ prefix),
 * not by marker comments.
 */
export function isExcludedEntry(val: string): boolean {
  const hasPrefix = val.includes(SPX_PREFIX);
  const hasSuffix = NODE_SUFFIXES.some((suffix) => val.includes(suffix));
  return hasPrefix && hasSuffix;
}
