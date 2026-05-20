export const SESSION_GIT_CONTEXT_ERROR_MESSAGE = {
  BRANCH_UNAVAILABLE: "Cannot create a handoff session because the current Git branch could not be detected.",
  EMPTY_BRANCH: "Cannot create a handoff session because Git returned an empty branch name.",
  DETACHED_HEAD: "Cannot create a handoff session from a detached HEAD.",
} as const;

/**
 * Error thrown when a session handoff cannot identify a usable Git work context.
 */
export class SessionGitContextError extends Error {
  constructor(message: string = SESSION_GIT_CONTEXT_ERROR_MESSAGE.BRANCH_UNAVAILABLE) {
    super(message);
    this.name = "SessionGitContextError";
  }
}

/**
 * Error thrown when a session handoff cannot identify the current Git branch.
 */
export class SessionDetachedHeadError extends SessionGitContextError {
  constructor() {
    super(SESSION_GIT_CONTEXT_ERROR_MESSAGE.DETACHED_HEAD);
    this.name = "SessionDetachedHeadError";
  }
}
