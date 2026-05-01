/**
 * Audit domain configuration — single source of truth for all audit path
 * components and filename conventions.
 *
 * All consumers must import path components from DEFAULT_AUDIT_CONFIG rather
 * than using string literals.
 *
 * @module audit/config
 */

const PATH_SEPARATOR = "/";
const ENCODED_SEPARATOR = "-";

/**
 * Configuration schema for the audit domain's artifact storage layout.
 */
export interface SpxAuditConfig {
  /** Gitignored state directory at the repository root (e.g. ".spx"). */
  readonly spxDir: string;
  /** Subdirectory under spxDir that holds per-node artifact directories. */
  readonly nodesSubdir: string;
  /** Filename suffix for audit verdict files (e.g. ".audit.xml"). */
  readonly auditSuffix: string;
}

/**
 * Default audit configuration. The single source of truth for all audit path
 * component names. Never mutated at runtime.
 */
export const DEFAULT_AUDIT_CONFIG = {
  spxDir: ".spx",
  nodesSubdir: "nodes",
  auditSuffix: ".audit.xml",
} as const satisfies SpxAuditConfig;

/**
 * Encodes a spec node path into a filesystem directory name by replacing
 * every path separator with a hyphen.
 *
 * Pure function: same input always produces the same output, no side effects.
 *
 * @example
 * encodeNodePath("spx/36-audit.enabler/21-test-harness.enabler")
 * // => "spx-36-audit.enabler-21-test-harness.enabler"
 */
export function encodeNodePath(nodePath: string): string {
  return nodePath.replaceAll(PATH_SEPARATOR, ENCODED_SEPARATOR);
}

/**
 * Formats a UTC timestamp as `YYYY-MM-DD_HH-mm-ss` for use as a verdict
 * filename stem.
 *
 * Uses UTC components so verdict files sort consistently regardless of the
 * agent's local timezone.
 *
 * @param now - Optional clock function; defaults to `() => new Date()`.
 *              Inject a fixed clock in tests for deterministic filenames.
 */
export function formatAuditTimestamp(now?: () => Date): string {
  const date = (now ?? (() => new Date()))();

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");

  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
}
