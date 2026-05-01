/**
 * Session-specific error types.
 *
 * @module session/errors
 */

/**
 * Base class for session errors.
 */
export class SessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionError";
  }
}

/**
 * Error thrown when a session cannot be found.
 */
export class SessionNotFoundError extends SessionError {
  /** The session ID that was not found */
  readonly sessionId: string;

  constructor(sessionId: string) {
    super(`Session not found: ${sessionId}. Check the session ID and try again.`);
    this.name = "SessionNotFoundError";
    this.sessionId = sessionId;
  }
}

/**
 * Error thrown when a session is not available for claiming (already claimed).
 */
export class SessionNotAvailableError extends SessionError {
  /** The session ID that is not available */
  readonly sessionId: string;

  constructor(sessionId: string) {
    super(`Session not available: ${sessionId}. It may have been claimed by another agent.`);
    this.name = "SessionNotAvailableError";
    this.sessionId = sessionId;
  }
}

/**
 * Error thrown when session content is invalid.
 */
export class SessionInvalidContentError extends SessionError {
  constructor(reason: string) {
    super(`Invalid session content: ${reason}`);
    this.name = "SessionInvalidContentError";
  }
}

/**
 * Error thrown when trying to release a session that is not currently claimed.
 */
export class SessionNotClaimedError extends SessionError {
  /** The session ID that is not claimed */
  readonly sessionId: string;

  constructor(sessionId: string) {
    super(`Session not claimed: ${sessionId}. The session is not in the doing directory.`);
    this.name = "SessionNotClaimedError";
    this.sessionId = sessionId;
  }
}

/**
 * Error thrown when no sessions are available for auto-pickup.
 */
export class NoSessionsAvailableError extends SessionError {
  constructor() {
    super("No sessions available. The todo directory is empty.");
    this.name = "NoSessionsAvailableError";
  }
}
