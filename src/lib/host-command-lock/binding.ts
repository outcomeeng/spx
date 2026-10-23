/**
 * The pinned lock binding: `fs-native-extensions` takes a nonblocking exclusive whole-file
 * `flock` lock on an open file description. The lock lasts until the last close of that
 * description, so a child that inherits the descriptor keeps the slot held. No code path releases
 * the lock explicitly; `unlock` exists only because the binding's contract declares it.
 *
 * @module lib/host-command-lock/binding
 */
import { createRequire } from "node:module";

export interface LockBinding {
  /** Takes the exclusive lock without blocking; false when another description holds it. */
  tryLock(fd: number): boolean;
  unlock(fd: number): void;
}

const nativeRequire = createRequire(import.meta.url);

export const defaultLockBinding: LockBinding = {
  tryLock: (fd) => (nativeRequire("fs-native-extensions") as LockBinding).tryLock(fd),
  unlock: (fd) => (nativeRequire("fs-native-extensions") as LockBinding).unlock(fd),
};
