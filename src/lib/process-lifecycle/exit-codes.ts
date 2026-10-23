/**
 * Conventional exit codes for CLI termination paths.
 *
 * The mapping follows POSIX convention: 128 + signal number for
 * signal-terminated processes, 0 for downstream-closed pipes (matches
 * `head`/`tee` behavior under `SIGPIPE`), 1 for genuine internal failures.
 *
 * @module lib/process-lifecycle/exit-codes
 */

export const SIGINT_EXIT_CODE = 130;
export const SIGTERM_EXIT_CODE = 143;
export const EPIPE_EXIT_CODE = 0;
export const UNCAUGHT_EXIT_CODE = 1;

/** Added to a signal number to report a child a signal ended. */
export const SIGNAL_EXIT_CODE_BASE = 128;
/** Reported for a child that exits with neither a code nor a signal; never reads as success. */
export const UNKNOWN_CHILD_EXIT_CODE = 1;
