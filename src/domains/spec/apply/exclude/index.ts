/**
 * Apply-exclude module.
 *
 * Translates spx/EXCLUDE into language-specific tool configuration.
 */

// Constants
export { COMMENT_CHAR, EXCLUDE_FILENAME, NODE_SUFFIXES, SPX_PREFIX } from "./constants";

// Parsing
export { readExcludedNodes, validateNodePath } from "./exclude-file";

// Mappings
export { isExcludedEntry, toMypyRegex, toPyrightPath, toPytestIgnore } from "./mappings";

// Adapters
export {
  ADAPTERS,
  detectLanguage,
  MYPY_SECTION,
  PYRIGHT_SECTION,
  PYTEST_SECTION,
  PYTHON_CONFIG_FILE,
  pythonAdapter,
} from "./adapters/index";
export type { LanguageAdapter } from "./adapters/index";

// Command
export { applyExcludeCommand } from "./command";

// Types
export type { ApplyExcludeDeps, ApplyExcludeOptions, ApplyExcludeResult, ApplyResult } from "./types";
