/**
 * Language adapter interface for apply-exclude.
 *
 * Each language (Python, TypeScript, etc.) provides an adapter that knows
 * how to apply spec-tree exclusions to its tool configuration file.
 */
import type { ApplyResult } from "../types.js";

/** Adapter that applies exclusions to a language-specific config file */
export interface LanguageAdapter {
  /** Human-readable language name (e.g., "Python", "TypeScript") */
  readonly language: string;
  /** Config file path relative to project root (e.g., "pyproject.toml") */
  readonly configFile: string;
  /** Tool names that are configured by this adapter (e.g., ["pytest", "mypy", "pyright"]) */
  readonly tools: readonly string[];
  /** Tool names explicitly NOT configured, with reason (e.g., "ruff (style checked regardless)") */
  readonly excluded: readonly string[];
  /** Apply exclusions to the config file content */
  applyExclusions(content: string, nodes: string[]): ApplyResult;
}
