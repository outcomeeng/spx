/**
 * Apply-exclude module.
 *
 * Translates spx/EXCLUDE into language-specific tool configuration.
 */

// Constants
export { COMMENT_CHAR, EXCLUDE_FILENAME, NODE_SUFFIXES, SPX_PREFIX } from "./constants.js";

// Parsing
export { readExcludedNodes, validateNodePath } from "./exclude-file.js";

// Mappings
export { isExcludedEntry, toMypyRegex, toPyrightPath, toPytestIgnore } from "./mappings.js";

// Adapters
export {
  ADAPTERS,
  detectLanguage,
  MYPY_SECTION,
  PYRIGHT_SECTION,
  PYTEST_SECTION,
  PYTHON_CONFIG_FILE,
  pythonAdapter,
} from "./adapters/index.js";
export type { LanguageAdapter } from "./adapters/index.js";

// Command
export { applyExcludeCommand } from "./command.js";

// Types
export type { ApplyExcludeDeps, ApplyExcludeOptions, ApplyExcludeResult, ApplyResult } from "./types.js";
