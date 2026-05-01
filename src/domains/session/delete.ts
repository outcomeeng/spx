/**
 * Session deletion utilities.
 *
 * @module session/delete
 */

import { SessionNotFoundError } from "./errors";

/**
 * Resolves the path to delete for a session ID.
 *
 * Given a session ID and a list of existing paths (checked by caller),
 * returns the first path that contains the session ID.
 *
 * @param sessionId - Session ID to find
 * @param existingPaths - Paths that were found to exist
 * @returns The path to the session file
 * @throws {SessionNotFoundError} When session is not found in any directory
 *
 * @example
 * ```typescript
 * // Caller checks which paths exist, passes only existing ones
 * const existingPaths = ['.spx/sessions/doing/2026-01-13_08-01-05.md'];
 * const path = resolveDeletePath('2026-01-13_08-01-05', existingPaths);
 * // => '.spx/sessions/doing/2026-01-13_08-01-05.md'
 * ```
 */
export function resolveDeletePath(
  sessionId: string,
  existingPaths: string[],
): string {
  // Find the first existing path that matches the session ID
  const matchingPath = existingPaths.find((path) => path.includes(sessionId));

  if (!matchingPath) {
    throw new SessionNotFoundError(sessionId);
  }

  return matchingPath;
}
