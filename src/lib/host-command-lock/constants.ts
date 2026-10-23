/**
 * Vocabulary of the host command lock: environment variable names, path segments, file modes, and
 * the load window limits. Each value has one owner here; tests and consumers import it.
 *
 * @module lib/host-command-lock/constants
 */

/** Environment variables the lock reads and exports. */
export const LOCK_ENV = {
  PATH_OVERRIDE: "SPX_ORCHESTRATION_LOCK_PATH",
  STATE_HOME: "XDG_STATE_HOME",
  HOME: "HOME",
  FD: "SPX_ORCHESTRATION_LOCK_FD",
  FILE_ID: "SPX_ORCHESTRATION_LOCK_FILE_ID",
} as const;

/** The orchestration lock file's location below a state home. */
export const LOCK_FILE_SEGMENTS: readonly string[] = ["engineering.outcome", "orchestration.lock"];

/** The state home below the account's home directory when `XDG_STATE_HOME` is unset or relative. */
export const LOCAL_STATE_SEGMENTS: readonly string[] = [".local", "state"];

export const DIRECTORY_MODE = 0o700;
export const FILE_MODE = 0o600;

/** The one platform whose launch paths and death cases hold real-process results. */
export const SUPPORTED_PLATFORM = { os: "darwin", arch: "arm64" } as const;

/** The Node major line the pinned lock binding is verified under. */
export const NODE_MAJOR = 24;

const MS_PER_SECOND = 1_000;

/** The load window every admission passes before the command starts. */
export const LOAD_WINDOW = {
  MIN_SAMPLES: 7,
  SAMPLE_INTERVAL_MS: 5 * MS_PER_SECOND,
  MIN_SPAN_MS: 30 * MS_PER_SECOND,
  MAX_GAP_MS: 10 * MS_PER_SECOND,
  ONE_MINUTE_FACTOR: 0.8,
  FIVE_MINUTE_FACTOR: 1,
  RISE_FACTOR: 0.05,
} as const;

/** One monotonic wait cap bounds slot contention and the load window together. */
export const DEFAULT_WAIT_SECONDS = 14_400;

/** The base delay before a busy lock is tried again; the randomized delay is added to it. */
export const BUSY_RETRY_BASE_MS = 1_000;
export const BUSY_RETRY_JITTER_MS = 500;

export const MILLISECONDS_PER_SECOND = MS_PER_SECOND;
