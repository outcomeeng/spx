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
