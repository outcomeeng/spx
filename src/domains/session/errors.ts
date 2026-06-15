/**
 * Session-specific error types.
 *
 * @module session/errors
 */

import { type HandoffBaseChecklist, SESSION_HANDOFF_BASE_ERROR_NAME } from "./handoff-base-checklist";

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
 * Error thrown when a `--fields` selection names a token outside the session
 * record field set. Carries the offending token and the valid field set so the
 * descriptor can render an actionable diagnostic.
 */
export class SessionInvalidFieldError extends SessionError {
  /** The unknown field token the caller supplied. */
  readonly field: string;
  /** The full set of valid field names. */
  readonly validFields: readonly string[];

  constructor(field: string, validFields: readonly string[]) {
    super(`Invalid field: "${field}". Valid fields: ${validFields.join(", ")}`);
    this.name = "SessionInvalidFieldError";
    this.field = field;
    this.validFields = validFields;
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
 * Error thrown when `spx session handoff` runs from a git work context that
 * cannot anchor a session to a base another agent can reach.
 *
 * Handoff is permitted from the main checkout (any reachable HEAD) or from a
 * non-main checkout that is clean and detached at the tip of `origin/<default
 * branch>`. A refusal renders one of three ways, distinguished by the carried
 * fields:
 *
 * - **Non-main-checkout refusal** carries a {@link HandoffBaseChecklist} the
 *   descriptor renders to standard error.
 * - **Non-git base** is `silent` — the descriptor writes nothing, only the
 *   non-zero exit.
 * - **Any other git refusal** (e.g. a main checkout with no reachable HEAD)
 *   carries no checklist and is not silent, so the descriptor writes the message
 *   as a plain diagnostic — only the non-git refusal is silent.
 */
export class SessionHandoffBaseError extends SessionError {
  /** The prerequisite checklist to render, or `null` for a non-checklist refusal. */
  readonly checklist: HandoffBaseChecklist | null;
  /** Whether the refusal surfaces no diagnostic — true only for a non-git base. */
  readonly silent: boolean;

  constructor(options: { checklist?: HandoffBaseChecklist | null; silent?: boolean } = {}) {
    super(
      "Cannot create a handoff session from this git work context. Run handoff "
        + "from the main checkout, or from a non-main checkout with a clean working "
        + "tree detached at the tip of the default branch.",
    );
    this.name = SESSION_HANDOFF_BASE_ERROR_NAME;
    this.checklist = options.checklist ?? null;
    this.silent = options.silent ?? false;
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

/**
 * Error thrown when handoff stdin opens with the legacy YAML-frontmatter
 * delimiter.
 *
 * `spx session handoff` accepts caller-supplied structured fields as a JSON
 * object at the start of stdin.
 * Input opening with `---\n` is the legacy wire format that destroys caller
 * content for any string containing YAML-significant characters (`#`, `:` after
 * a space, leading whitespace) and is rejected with this error.
 */
export class SessionLegacyFrontmatterInputError extends SessionError {
  constructor() {
    super(
      "Invalid handoff input: stdin opens with the YAML-frontmatter delimiter `---`. "
        + "Use the JSON-prefix wire format: a single JSON object holding caller-supplied "
        + "fields followed by the body bytes verbatim. Example:\n\n"
        + "  printf '%s\\n' '{\"priority\":\"high\",\"goal\":\"...\",\"next_step\":\"...\"}' '# Body' "
        + "| spx session handoff",
    );
    this.name = "SessionLegacyFrontmatterInputError";
  }
}

/**
 * Error thrown when `spx session handoff` is given an explicit work-branch ref
 * in its stdin JSON header but that branch does not exist on `origin`.
 *
 * The recorded `git_ref` must name a base a resuming agent can reach from the
 * shared queue; an origin branch satisfies that, an unpushed local name does
 * not. Push the branch to `origin`, or omit `git_ref` to record the git
 * context instead.
 */
export class SessionWorkBranchNotOnOriginError extends SessionError {
  /** The work-branch ref the caller supplied that does not resolve on `origin`. */
  readonly workBranch: string;

  constructor(workBranch: string) {
    super(
      `Work-branch ref not found on origin: ${workBranch}. Push the branch to origin `
        + "before recording it as the handoff base, or omit git_ref to record the git context.",
    );
    this.name = "SessionWorkBranchNotOnOriginError";
    this.workBranch = workBranch;
  }
}

/**
 * Error thrown when the JSON header at the start of handoff stdin is malformed
 * or fails schema validation.
 *
 * Raised by `parseHandoffInput` when stdin does not open with `{`, the opening
 * brace has no matching close, `JSON.parse` fails, or the parsed object does
 * not satisfy the caller-field schema.
 */
export class SessionInvalidJsonHeaderError extends SessionError {
  constructor(reason: string) {
    super(`Invalid JSON header for handoff: ${reason}`);
    this.name = "SessionInvalidJsonHeaderError";
  }
}
