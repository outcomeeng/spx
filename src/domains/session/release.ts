/**
 * Session release utilities.
 *
 * This module provides pure functions for releasing claimed sessions:
 * - Path construction for release operations
 * - Finding the current session in doing directory
 *
 * @module session/release
 */

import { parseSessionId } from "./timestamp";

/**
 * Configuration for session release paths.
 */
export interface ReleasePathConfig {
  /** Directory containing claimed sessions */
  doingDir: string;
  /** Directory for released sessions */
  todoDir: string;
}

/**
 * Result of building release paths.
 */
export interface ReleasePaths {
  /** Source path (session in doing) */
  source: string;
  /** Target path (session in todo) */
  target: string;
}

/**
 * Session reference with minimal required fields.
 */
export interface SessionRef {
  id: string;
}

/**
 * Builds source and target paths for releasing a session.
 *
 * @param sessionId - The session ID (timestamp format)
 * @param config - Directory configuration
 * @returns Source and target paths for the release operation
 *
 * @example
 * ```typescript
 * const paths = buildReleasePaths("2026-01-13_08-01-05", {
 *   doingDir: ".spx/sessions/doing",
 *   todoDir: ".spx/sessions/todo",
 * });
 * // => { source: ".spx/sessions/doing/2026-01-13_08-01-05.md", target: ".spx/sessions/todo/2026-01-13_08-01-05.md" }
 * ```
 */
export function buildReleasePaths(sessionId: string, config: ReleasePathConfig): ReleasePaths {
  return {
    source: `${config.doingDir}/${sessionId}.md`,
    target: `${config.todoDir}/${sessionId}.md`,
  };
}

/**
 * Finds the most recent session in the doing directory.
 *
 * When no session ID is provided to release, this function
 * selects the most recently claimed session (newest timestamp).
 *
 * @param doingSessions - Sessions currently in doing directory
 * @returns The most recent session, or null if empty
 *
 * @example
 * ```typescript
 * const sessions = [
 *   { id: "2026-01-10_08-00-00" },
 *   { id: "2026-01-13_08-00-00" },
 * ];
 * const current = findCurrentSession(sessions);
 * // => { id: "2026-01-13_08-00-00" }
 * ```
 */
export function findCurrentSession(doingSessions: SessionRef[]): SessionRef | null {
  if (doingSessions.length === 0) {
    return null;
  }

  // Sort by timestamp descending (newest first)
  const sorted = [...doingSessions].sort((a, b) => {
    const dateA = parseSessionId(a.id);
    const dateB = parseSessionId(b.id);

    // Handle invalid session IDs by treating them as oldest
    if (!dateA && !dateB) return 0;
    if (!dateA) return 1; // a goes after b
    if (!dateB) return -1; // b goes after a

    return dateB.getTime() - dateA.getTime();
  });

  return sorted[0];
}
