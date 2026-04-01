/**
 * Constants for apply-exclude operations.
 */

/** Prefix for all spec-tree paths in config files */
export const SPX_PREFIX = "spx/";

/** Node type suffixes that identify spec-tree directories */
export const NODE_SUFFIXES = [".outcome/", ".enabler/", ".capability/", ".feature/", ".story/"] as const;

/** Comment character in EXCLUDE files */
export const COMMENT_CHAR = "#";

/** Default name of the EXCLUDE file within spx/ */
export const EXCLUDE_FILENAME = "EXCLUDE";
