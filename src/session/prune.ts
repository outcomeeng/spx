/**
 * Session pruning utilities for cleaning up old sessions.
 *
 * @module session/prune
 */

import { parseSessionId } from "./timestamp";
import type { Session } from "./types";

/**
 * Default number of sessions to keep when pruning.
 */
export const DEFAULT_KEEP_COUNT = 5;

/**
 * Options for selecting sessions to delete.
 */
export interface SelectSessionsOptions {
  /**
   * Number of most recent sessions to keep.
   * Defaults to DEFAULT_KEEP_COUNT (5).
   */
  keep?: number;
}

/**
 * Selects sessions to delete based on keep count.
 *
 * Sessions are sorted by timestamp (oldest first), and the oldest sessions
 * beyond the keep count are selected for deletion.
 *
 * @param sessions - Array of sessions to consider
 * @param options - Selection options including keep count
 * @returns Array of sessions to delete (oldest sessions beyond keep count)
 *
 * @example
 * ```typescript
 * // Given 10 sessions, keep 5 newest
 * const toDelete = selectSessionsToDelete(sessions, { keep: 5 });
 * // Returns the 5 oldest sessions
 *
 * // Using default keep count (5)
 * const toDelete = selectSessionsToDelete(sessions);
 * ```
 */
export function selectSessionsToDelete(
  sessions: Session[],
  options: SelectSessionsOptions = {},
): Session[] {
  const keep = options.keep ?? DEFAULT_KEEP_COUNT;

  // If we have fewer sessions than the keep count, delete nothing
  if (sessions.length <= keep) {
    return [];
  }

  // Sort sessions by timestamp (oldest first for deletion selection)
  const sorted = [...sessions].sort((a, b) => {
    const dateA = parseSessionId(a.id);
    const dateB = parseSessionId(b.id);

    // Handle invalid session IDs by treating them as oldest (delete first)
    if (!dateA && !dateB) return 0;
    if (!dateA) return -1; // a (invalid) goes before b (to be deleted first)
    if (!dateB) return 1; // b (invalid) goes before a

    return dateA.getTime() - dateB.getTime();
  });

  // Return the oldest sessions (those beyond the keep count)
  const deleteCount = sessions.length - keep;
  return sorted.slice(0, deleteCount);
}
