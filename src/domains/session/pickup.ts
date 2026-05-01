/**
 * Session pickup/claiming utilities.
 *
 * This module provides pure functions for atomic session claiming:
 * - Path construction for claim operations
 * - Error classification for claim failures
 * - Session selection for auto-pickup
 *
 * @module session/pickup
 */

import { SessionNotAvailableError } from "./errors";
import { parseSessionId } from "./timestamp";
import { PRIORITY_ORDER, type Session } from "./types";

/**
 * Configuration for session claim paths.
 */
export interface ClaimPathConfig {
  /** Directory containing sessions to be claimed */
  todoDir: string;
  /** Directory for claimed sessions */
  doingDir: string;
}

/**
 * Result of building claim paths.
 */
export interface ClaimPaths {
  /** Source path (session in todo) */
  source: string;
  /** Target path (session in doing) */
  target: string;
}

/**
 * Builds source and target paths for claiming a session.
 *
 * @param sessionId - The session ID (timestamp format)
 * @param config - Directory configuration
 * @returns Source and target paths for the claim operation
 *
 * @example
 * ```typescript
 * const paths = buildClaimPaths("2026-01-13_08-01-05", {
 *   todoDir: ".spx/sessions/todo",
 *   doingDir: ".spx/sessions/doing",
 * });
 * // => { source: ".spx/sessions/todo/2026-01-13_08-01-05.md", target: ".spx/sessions/doing/2026-01-13_08-01-05.md" }
 * ```
 */
export function buildClaimPaths(sessionId: string, config: ClaimPathConfig): ClaimPaths {
  return {
    source: `${config.todoDir}/${sessionId}.md`,
    target: `${config.doingDir}/${sessionId}.md`,
  };
}

/**
 * Classifies a filesystem error that occurred during claiming.
 *
 * When a claim operation fails, this function maps the raw filesystem
 * error to an appropriate domain error:
 * - ENOENT: Session was claimed by another agent (SessionNotAvailable)
 * - Other errors: Rethrown as-is
 *
 * @param error - The error from the claim operation
 * @param sessionId - The session ID being claimed
 * @returns A SessionNotAvailableError if ENOENT
 * @throws The original error if not ENOENT
 *
 * @example
 * ```typescript
 * const err = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
 * const classified = classifyClaimError(err, "test-id");
 * // => SessionNotAvailableError
 * ```
 */
export function classifyClaimError(error: unknown, sessionId: string): SessionNotAvailableError {
  if (error instanceof Error && "code" in error && error.code === "ENOENT") {
    return new SessionNotAvailableError(sessionId);
  }
  throw error;
}

/**
 * Selects the best session for auto-pickup based on priority and timestamp.
 *
 * Selection criteria:
 * 1. Highest priority (high > medium > low)
 * 2. Oldest timestamp (FIFO) for sessions with equal priority
 *
 * @param sessions - Available sessions to choose from
 * @returns The best session to claim, or null if no sessions available
 *
 * @example
 * ```typescript
 * const sessions = [
 *   { id: "low-1", metadata: { priority: "low" } },
 *   { id: "high-1", metadata: { priority: "high" } },
 * ];
 * const best = selectBestSession(sessions);
 * // => { id: "high-1", ... }
 * ```
 */
export function selectBestSession(sessions: Session[]): Session | null {
  if (sessions.length === 0) {
    return null;
  }

  // Sort by priority (high first) then by timestamp (oldest first for FIFO)
  const sorted = [...sessions].sort((a, b) => {
    // First: sort by priority (high = 0, medium = 1, low = 2)
    const priorityA = PRIORITY_ORDER[a.metadata.priority];
    const priorityB = PRIORITY_ORDER[b.metadata.priority];

    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }

    // Second: sort by timestamp (oldest first = FIFO = ascending)
    const dateA = parseSessionId(a.id);
    const dateB = parseSessionId(b.id);

    // Handle invalid session IDs by treating them as newest (go last)
    if (!dateA && !dateB) return 0;
    if (!dateA) return 1; // a goes after b
    if (!dateB) return -1; // b goes after a

    return dateA.getTime() - dateB.getTime();
  });

  return sorted[0];
}
