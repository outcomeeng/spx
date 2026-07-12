/**
 * Tool discovery module for validation infrastructure.
 * @module validation/discovery
 */

export {
  defaultToolDiscoveryDeps,
  discoverTool,
  type DiscoverToolOptions,
  formatSkipMessage,
  TOOL_DISCOVERY_PRIORITY,
  type ToolDiscoveryDeps,
  type ToolDiscoveryPriority,
  type ToolDiscoveryResult,
  type ToolLocation,
  type ToolNotFound,
} from "./tool-finder";

export {
  defaultLanguageDetectionDeps,
  detectLanguages,
  detectPython,
  detectTypeScript,
  ESLINT_CONFIG_FILES,
  ESLINT_PRODUCTION_CONFIG_FILES,
  type EslintConfigFile,
  type EslintProductionConfigFile,
  type LanguageDetection,
  type LanguageDetectionDeps,
  PYTHON_MARKER,
  type PythonDetection,
  TYPESCRIPT_MARKER,
  type TypeScriptDetection,
} from "./language-finder";

export { TOOL_DISCOVERY, type ToolSource } from "./constants";
