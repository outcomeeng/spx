/**
 * Parse spx/EXCLUDE files into node paths with validation.
 */
import { COMMENT_CHAR } from "./constants";

/** Characters that are unsafe in TOML string values */
const TOML_UNSAFE_PATTERN = /["\\\n\r\t]/;

/** Path traversal sequences */
const PATH_TRAVERSAL_PATTERN = /(?:^|\/)\.\.(?:\/|$)/;

/**
 * Validate that a node path is safe for use in config file generation.
 *
 * Rejects:
 * - Path traversal (`..` segments)
 * - Absolute paths (starting with `/`)
 * - TOML-unsafe characters (`"`, `\`, newlines, tabs)
 *
 * @returns Error message if invalid, null if valid
 */
export function validateNodePath(path: string): string | null {
  if (path.startsWith("/")) {
    return `absolute path rejected: ${path}`;
  }
  if (PATH_TRAVERSAL_PATTERN.test(path)) {
    return `path traversal rejected: ${path}`;
  }
  if (TOML_UNSAFE_PATTERN.test(path)) {
    return `TOML-unsafe characters rejected: ${path}`;
  }
  return null;
}

/**
 * Read node paths from EXCLUDE file content, stripping comments and blanks.
 * Invalid paths are silently filtered out.
 *
 * @param content - Raw content of the EXCLUDE file
 * @returns Array of valid node paths (trimmed, non-empty, non-comment, safe)
 */
export function readExcludedNodes(content: string): string[] {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith(COMMENT_CHAR))
    .filter((line) => validateNodePath(line) === null);
}
