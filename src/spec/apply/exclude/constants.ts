/**
 * Constants for apply-exclude operations.
 */
import { NODE_SUFFIXES as SPEC_TREE_NODE_SUFFIXES, SPEC_TREE_CONFIG } from "@/spec/config";

/** Prefix for all spec-tree paths in config files */
export const SPX_PREFIX = `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/`;

/** Node type suffixes that identify spec-tree directories */
export const NODE_SUFFIXES: readonly string[] = SPEC_TREE_NODE_SUFFIXES.map((suffix) => `${suffix}/`);

/** Comment character in EXCLUDE files */
export const COMMENT_CHAR = "#";

/** Default name of the EXCLUDE file within spx/ */
export const EXCLUDE_FILENAME = "EXCLUDE";
