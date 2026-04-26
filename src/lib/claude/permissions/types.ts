/**
 * Types for Claude Code permissions and settings
 */

/**
 * Permission category
 */
export type PermissionCategory = "allow" | "deny" | "ask";

/**
 * Permission string with its type (allow/deny/ask) and parsed components
 *
 * Examples:
 * - "Bash(git:*)"
 * - "Read(file_path:/Users/user/Code/**)"
 * - "WebFetch(domain:github.com)"
 */
export interface Permission {
  /** Raw permission string as stored in settings.json */
  raw: string;
  /** Permission type (e.g., "Bash", "Read", "WebFetch") */
  type: string;
  /** Permission scope (e.g., "git:*", "file_path:/Users/...", "domain:github.com") */
  scope: string;
  /** Permission category: allow, deny, or ask */
  category: PermissionCategory;
}

/**
 * Structured permissions from a settings file
 */
export interface Permissions {
  allow?: string[];
  deny?: string[];
  ask?: string[];
}

/**
 * Full Claude Code settings.json structure
 */
export interface ClaudeSettings {
  $schema?: string;
  permissions?: Permissions;
  includeCoAuthoredBy?: boolean;
  hooks?: Record<string, unknown>;
  [key: string]: unknown; // Allow other settings we don't manage
}

/**
 * Result of subsumption detection
 */
export interface SubsumptionResult {
  /** Permission that subsumes others */
  broader: Permission;
  /** Permissions that are subsumed (should be removed) */
  narrower: Permission[];
}

/**
 * Conflict between allow and deny permissions
 */
export interface PermissionConflict {
  /** Permission string that appears in both allow and deny */
  permission: string;
  /** Whether conflict was resolved automatically or requires user input */
  resolution: "deny" | "ask-user";
}

/**
 * Statistics about permissions added during consolidation
 */
export interface PermissionsAdded {
  allow: string[];
  deny: string[];
  ask: string[];
}

/**
 * Result of consolidation operation
 */
export interface ConsolidationResult {
  /** Number of files scanned */
  filesScanned: number;
  /** Number of files with valid permissions processed */
  filesProcessed: number;
  /** Number of files skipped (malformed, no permissions) */
  filesSkipped: number;
  /** Permissions added by category */
  added: PermissionsAdded;
  /** Permission strings removed due to subsumption */
  subsumed: string[];
  /** Number of conflicts resolved (moved from allow to deny) */
  conflictsResolved: number;
  /** Path to backup file created (if applicable) */
  backupPath?: string;
  /** Path to output file (if --output-file was used) */
  outputPath?: string;
}

/**
 * Scope pattern type
 */
export interface ScopePattern {
  /** Type of scope pattern: command or path */
  type: "command" | "path";
  /** The pattern string (e.g., "git:*" or "/Users/user/Code/**") */
  pattern: string;
}
