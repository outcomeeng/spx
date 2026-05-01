/**
 * Types for apply-exclude operations.
 */

/** Result of applying exclusions to a config file */
export interface ApplyResult {
  /** Whether the file content was modified */
  changed: boolean;
  /** The (possibly modified) file content */
  content: string;
}

/** Dependencies injected into the command handler */
export interface ApplyExcludeDeps {
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, content: string) => Promise<void>;
  fileExists: (path: string) => Promise<boolean>;
}

/** Options for the apply-exclude command */
export interface ApplyExcludeOptions {
  /** Working directory (project root) */
  cwd: string;
  /** Injected dependencies (for testing) */
  deps: ApplyExcludeDeps;
}

/** Result from the apply-exclude command */
export interface ApplyExcludeResult {
  /** Exit code (0 = success, 1 = error) */
  exitCode: number;
  /** Output message */
  output: string;
}
