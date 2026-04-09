/**
 * Shared types for the validation module.
 *
 * These types define the contracts for validation steps and their dependencies,
 * enabling dependency injection for testability (per ADR-001).
 *
 * @module validation/types
 */

import type { ChildProcess, SpawnOptions } from "node:child_process";

// =============================================================================
// DEPENDENCY INJECTION INTERFACES
// =============================================================================

/**
 * Interface for subprocess execution.
 *
 * Enables dependency injection for testing - production code uses real spawn,
 * tests can provide controlled implementations.
 *
 * @example
 * ```typescript
 * // Production usage
 * const runner: ProcessRunner = { spawn };
 *
 * // Test usage with controlled implementation
 * const testRunner: ProcessRunner = {
 *   spawn: (cmd, args, opts) => createMockProcess({ exitCode: 0 }),
 * };
 * ```
 */
export interface ProcessRunner {
  spawn(command: string, args: readonly string[], options?: SpawnOptions): ChildProcess;
}

// =============================================================================
// VALIDATION SCOPE
// =============================================================================

/**
 * Validation scope constants.
 *
 * @example
 * ```typescript
 * import { VALIDATION_SCOPES } from "./types.js";
 * const scope = VALIDATION_SCOPES.FULL; // "full"
 * ```
 */
export const VALIDATION_SCOPES = {
  /** Validate entire codebase including tests and scripts */
  FULL: "full",
  /** Validate production files only */
  PRODUCTION: "production",
} as const;

/** Type for validation scope values */
export type ValidationScope = (typeof VALIDATION_SCOPES)[keyof typeof VALIDATION_SCOPES];

/**
 * Configuration for validation scope.
 *
 * Derived from tsconfig.json settings to ensure alignment between
 * TypeScript and ESLint validation.
 */
export interface ScopeConfig {
  /** Directories to include in validation */
  directories: string[];
  /** File patterns to match (from tsconfig include) */
  filePatterns: string[];
  /** Patterns to exclude from validation */
  excludePatterns: string[];
}

// =============================================================================
// EXECUTION MODE
// =============================================================================

/**
 * Execution mode constants.
 */
export const EXECUTION_MODES = {
  /** Read-only mode - report errors without fixing */
  READ: "read",
  /** Write mode - fix errors when possible (e.g., eslint --fix) */
  WRITE: "write",
} as const;

/** Type for execution mode values */
export type ExecutionMode = (typeof EXECUTION_MODES)[keyof typeof EXECUTION_MODES];

// =============================================================================
// VALIDATION CONTEXT
// =============================================================================

/**
 * Context object passed to validation steps.
 *
 * Contains all information needed to execute a validation step,
 * enabling pure functions that don't rely on global state.
 */
export interface ValidationContext {
  /** Root directory of the project being validated */
  projectRoot: string;
  /** Execution mode (read-only or write/fix) */
  mode?: ExecutionMode;
  /** Validation scope (full or production) */
  scope: ValidationScope;
  /** Scope configuration derived from tsconfig */
  scopeConfig: ScopeConfig;
  /** Which validations are enabled */
  enabledValidations: Partial<Record<string, boolean>>;
  /** Specific files to validate (if file-specific mode) */
  validatedFiles?: string[];
  /** Whether running in file-specific mode */
  isFileSpecificMode: boolean;
  /** ESLint flat config file name, determined by language detection */
  eslintConfigFile?: string;
}

// =============================================================================
// VALIDATION RESULTS
// =============================================================================

/**
 * Result from a validation step.
 *
 * All validation steps return this structure to enable consistent
 * result handling and progress reporting.
 */
export interface ValidationStepResult {
  /** Whether the validation passed */
  success: boolean;
  /** Error message if validation failed */
  error?: string;
  /** Duration of the validation step in milliseconds */
  duration: number;
  /** Whether the step was skipped (e.g., tool not available) */
  skipped?: boolean;
}

/**
 * Result from circular dependency validation.
 *
 * Extends ValidationStepResult with circular dependency details.
 */
export interface CircularDependencyResult {
  /** Whether no circular dependencies were found */
  success: boolean;
  /** Error message if circular dependencies found */
  error?: string;
  /** The circular dependency cycles found */
  circularDependencies?: string[][];
}

// =============================================================================
// VALIDATION STEP INTERFACE
// =============================================================================

/**
 * Definition of a validation step.
 *
 * Validation steps are pluggable units that can be enabled/disabled
 * and executed in sequence.
 */
export interface ValidationStep {
  /** Unique identifier for the step */
  id: string;
  /** Human-readable name for progress reporting */
  name: string;
  /** Description shown during execution */
  description: string;
  /** Function to determine if step should run */
  enabled: (context: ValidationContext) => boolean;
  /** Function to execute the validation */
  execute: (context: ValidationContext) => Promise<ValidationStepResult>;
}
