/**
 * Public surface of the host command lock: slot admission, the load gate, the wait cap, the holder
 * record, nested pass-through, and the terminal result.
 *
 * @module lib/host-command-lock
 */

export { defaultLockBinding, type LockBinding } from "./binding";
export {
  DEFAULT_WAIT_SECONDS,
  DIRECTORY_MODE,
  FILE_MODE,
  LOAD_WINDOW,
  LOCAL_STATE_SEGMENTS,
  LOCK_ENV,
  LOCK_FILE_SEGMENTS,
  NODE_MAJOR,
  SUPPORTED_PLATFORM,
} from "./constants";
export { defaultFilesystem, type HolderRecord, type HostCommandLockFilesystem, readHolderRecord } from "./filesystem";
export {
  createHostCommandLock,
  type HostCommandLock,
  type HostCommandLockDeps,
  type LoadSource,
  type Platform,
  type RunReport,
  type RunRequest,
} from "./host-command-lock";
export { type LoadSample, windowAdmits } from "./load-gate";
export { type Environment, type LockPathResolution, resolveLockPath } from "./lock-path";
export {
  NOT_READY_EXIT_CODE,
  OUTCOME_KIND,
  RESULT_SCHEMA,
  RESULT_STATUS,
  type ResultLine,
  type ResultStatus,
  SIGNAL_EXIT_CODE_BASE,
  type TerminalOutcome,
  terminalOutcome,
  type TerminalReport,
} from "./result";
