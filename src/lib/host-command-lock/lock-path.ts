/**
 * Resolution of the orchestration lock file's location from the environment.
 *
 * @module lib/host-command-lock/lock-path
 */
import { isAbsolute, join } from "node:path";

import { LOCAL_STATE_SEGMENTS, LOCK_ENV, LOCK_FILE_SEGMENTS } from "./constants";
import { RESULT_STATUS, type ResultStatus } from "./result";

export type Environment = Readonly<Record<string, string | undefined>>;

export type LockPathResolution =
  | { readonly ok: true; readonly path: string }
  | { readonly ok: false; readonly status: ResultStatus };

/**
 * `SPX_ORCHESTRATION_LOCK_PATH` absolute selects that path; set but empty or relative fails;
 * otherwise an absolute `XDG_STATE_HOME`, otherwise the account's home, locates the file.
 */
export function resolveLockPath(environment: Environment): LockPathResolution {
  const override = environment[LOCK_ENV.PATH_OVERRIDE];
  if (override !== undefined) {
    return isAbsolute(override) ? { ok: true, path: override } : { ok: false, status: RESULT_STATUS.INVALID_ARGUMENTS };
  }
  const stateHome = environment[LOCK_ENV.STATE_HOME];
  if (stateHome !== undefined && isAbsolute(stateHome)) {
    return { ok: true, path: join(stateHome, ...LOCK_FILE_SEGMENTS) };
  }
  const home = environment[LOCK_ENV.HOME];
  if (home !== undefined && isAbsolute(home)) {
    return { ok: true, path: join(home, ...LOCAL_STATE_SEGMENTS, ...LOCK_FILE_SEGMENTS) };
  }
  return { ok: false, status: RESULT_STATUS.INVALID_ARGUMENTS };
}
