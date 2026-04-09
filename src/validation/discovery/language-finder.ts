/**
 * Language detection for validation infrastructure.
 *
 * Detects which programming languages a project uses based on configuration
 * file presence. Language-specific validation tools (ESLint, tsc, mypy) consult
 * detection results to determine whether to run.
 *
 * @module validation/discovery/language-finder
 */

import fs from "node:fs";
import path from "node:path";

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Marker file for TypeScript projects, checked in the project root.
 */
export const TYPESCRIPT_MARKER = "tsconfig.json";

/**
 * Marker file for Python projects, checked in the project root.
 */
export const PYTHON_MARKER = "pyproject.toml";

/**
 * ESLint flat config file names, in priority order.
 *
 * ESLint 9+ uses flat config exclusively. When multiple config files exist in
 * the same directory, the highest-priority one wins.
 */
export const ESLINT_CONFIG_FILES = [
  "eslint.config.ts",
  "eslint.config.js",
  "eslint.config.mjs",
  "eslint.config.cjs",
] as const;

/**
 * Type of an ESLint config file name.
 */
export type EslintConfigFile = (typeof ESLINT_CONFIG_FILES)[number];

// =============================================================================
// TYPES
// =============================================================================

/**
 * Result of TypeScript language detection.
 */
export interface TypeScriptDetection {
  /** Whether TypeScript is present in the project. */
  present: boolean;
  /** The ESLint flat config file name found, if any. Only set when `present` is true. */
  eslintConfigFile?: EslintConfigFile;
}

/**
 * Result of Python language detection.
 */
export interface PythonDetection {
  /** Whether Python is present in the project. */
  present: boolean;
}

/**
 * Result of full language detection.
 */
export interface LanguageDetection {
  typescript: TypeScriptDetection;
  python: PythonDetection;
}

/**
 * Dependencies for language detection.
 *
 * Enables type-safe dependency injection for testing without mocking.
 */
export interface LanguageDetectionDeps {
  /**
   * Check whether a file exists at the given absolute path.
   * @param filePath - Absolute path to check.
   */
  existsSync: (filePath: string) => boolean;
}

/**
 * Default production dependencies.
 */
export const defaultLanguageDetectionDeps: LanguageDetectionDeps = {
  existsSync: fs.existsSync,
};

// =============================================================================
// DETECTION FUNCTIONS
// =============================================================================

/**
 * Detect whether a project uses TypeScript.
 *
 * TypeScript is present when `tsconfig.json` exists in the project root. When
 * present, the function also searches for an ESLint flat config file and
 * returns its name in priority order.
 *
 * @param projectRoot - Absolute path to the project root.
 * @param deps - Injectable filesystem dependencies.
 * @returns Detection result with presence flag and optional ESLint config path.
 */
export function detectTypeScript(
  projectRoot: string,
  deps: LanguageDetectionDeps = defaultLanguageDetectionDeps,
): TypeScriptDetection {
  const present = deps.existsSync(path.join(projectRoot, TYPESCRIPT_MARKER));

  if (!present) {
    return { present: false };
  }

  const eslintConfigFile = ESLINT_CONFIG_FILES.find((configFile) =>
    deps.existsSync(path.join(projectRoot, configFile))
  );

  return eslintConfigFile === undefined
    ? { present: true }
    : { present: true, eslintConfigFile };
}

/**
 * Detect whether a project uses Python.
 *
 * Python is present when `pyproject.toml` exists in the project root.
 *
 * @param projectRoot - Absolute path to the project root.
 * @param deps - Injectable filesystem dependencies.
 * @returns Detection result with presence flag.
 */
export function detectPython(
  projectRoot: string,
  deps: LanguageDetectionDeps = defaultLanguageDetectionDeps,
): PythonDetection {
  const present = deps.existsSync(path.join(projectRoot, PYTHON_MARKER));
  return { present };
}

/**
 * Detect all supported languages in a project.
 *
 * @param projectRoot - Absolute path to the project root.
 * @param deps - Injectable filesystem dependencies.
 * @returns Detection result for every supported language.
 */
export function detectLanguages(
  projectRoot: string,
  deps: LanguageDetectionDeps = defaultLanguageDetectionDeps,
): LanguageDetection {
  return {
    typescript: detectTypeScript(projectRoot, deps),
    python: detectPython(projectRoot, deps),
  };
}
