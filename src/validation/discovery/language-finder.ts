/**
 * Language detection for validation infrastructure.
 *
 * Detects which programming languages a product uses based on configuration
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
 * Marker file for TypeScript products, checked in the product root.
 */
export const TYPESCRIPT_MARKER = "tsconfig.json";

/**
 * Marker file for Python products, checked in the product root.
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
export const ESLINT_PRODUCTION_CONFIG_FILES = [
  "eslint.config.production.ts",
  "eslint.config.production.js",
  "eslint.config.production.mjs",
  "eslint.config.production.cjs",
] as const;

/**
 * Type of an ESLint config file name.
 */
export type EslintConfigFile = (typeof ESLINT_CONFIG_FILES)[number];
export type EslintProductionConfigFile = (typeof ESLINT_PRODUCTION_CONFIG_FILES)[number];

// =============================================================================
// TYPES
// =============================================================================

/**
 * Result of TypeScript language detection.
 */
export interface TypeScriptDetection {
  /** Whether TypeScript is present in the product. */
  present: boolean;
  /** The ESLint flat config file name found, if any. Only set when `present` is true. */
  eslintConfigFile?: EslintConfigFile;
  /** Production-scope ESLint flat config file name found, if any. Only set when `present` is true. */
  productionEslintConfigFile?: EslintProductionConfigFile;
}

/**
 * Result of Python language detection.
 */
export interface PythonDetection {
  /** Whether Python is present in the product. */
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
 * Detect whether a product uses TypeScript.
 *
 * TypeScript is present when `tsconfig.json` exists in the product root. When
 * present, the function also searches for an ESLint flat config file and
 * returns its name in priority order.
 *
 * @param productDir - Absolute path to the product root.
 * @param deps - Injectable filesystem dependencies.
 * @returns Detection result with presence flag and optional ESLint config path.
 */
export function detectTypeScript(
  productDir: string,
  deps: LanguageDetectionDeps = defaultLanguageDetectionDeps,
): TypeScriptDetection {
  const present = deps.existsSync(path.join(productDir, TYPESCRIPT_MARKER));

  if (!present) {
    return { present: false };
  }

  const eslintConfigFile = ESLINT_CONFIG_FILES.find((configFile) => deps.existsSync(path.join(productDir, configFile)));
  const productionEslintConfigFile = ESLINT_PRODUCTION_CONFIG_FILES.find((configFile) =>
    deps.existsSync(path.join(productDir, configFile))
  );

  return { present: true, eslintConfigFile, productionEslintConfigFile };
}

/**
 * Detect whether a product uses Python.
 *
 * Python is present when `pyproject.toml` exists in the product root.
 *
 * @param productDir - Absolute path to the product root.
 * @param deps - Injectable filesystem dependencies.
 * @returns Detection result with presence flag.
 */
export function detectPython(
  productDir: string,
  deps: LanguageDetectionDeps = defaultLanguageDetectionDeps,
): PythonDetection {
  const present = deps.existsSync(path.join(productDir, PYTHON_MARKER));
  return { present };
}

/**
 * Detect all supported languages in a product.
 *
 * @param productDir - Absolute path to the product root.
 * @param deps - Injectable filesystem dependencies.
 * @returns Detection result for every supported language.
 */
export function detectLanguages(
  productDir: string,
  deps: LanguageDetectionDeps = defaultLanguageDetectionDeps,
): LanguageDetection {
  return {
    typescript: detectTypeScript(productDir, deps),
    python: detectPython(productDir, deps),
  };
}
