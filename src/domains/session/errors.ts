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
 * Error thrown when handoff content has no usable goal.
 */
export class SessionInvalidGoalError extends SessionError {
  constructor() {
    super("Invalid session goal: goal must be a non-empty string.");
    this.name = "SessionInvalidGoalError";
  }
}

/**
 * Error thrown when handoff content has no usable next step.
 */
export class SessionInvalidNextStepError extends SessionError {
  constructor() {
    super("Invalid session next_step: next_step must be a non-empty string.");
    this.name = "SessionInvalidNextStepError";
  }
}

/**
 * Error thrown when archive is attempted without a result.
 */
export class SessionInvalidResultError extends SessionError {
  constructor(sessionId: string) {
    super(`Invalid session result for ${sessionId}: result must be a non-empty string before archive.`);
    this.name = "SessionInvalidResultError";
  }
}

export const SESSION_GIT_CONTEXT_ERROR_MESSAGE = {
  BRANCH_UNAVAILABLE: "Cannot create a handoff session because the current Git branch could not be detected.",
  EMPTY_BRANCH: "Cannot create a handoff session because Git returned an empty branch name.",
  DETACHED_HEAD: "Cannot create a handoff session from a detached HEAD.",
} as const;

/**
 * Error thrown when handoff cannot identify a usable Git work context.
 */
export class SessionGitContextError extends SessionError {
  constructor(message: string = SESSION_GIT_CONTEXT_ERROR_MESSAGE.BRANCH_UNAVAILABLE) {
    super(message);
    this.name = "SessionGitContextError";
  }
}

/**
 * Error thrown when handoff cannot identify the current Git branch.
 */
export class SessionDetachedHeadError extends SessionGitContextError {
  constructor() {
    super(SESSION_GIT_CONTEXT_ERROR_MESSAGE.DETACHED_HEAD);
    this.name = "SessionDetachedHeadError";
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
