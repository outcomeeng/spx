/**
 * The filesystem the host command lock reaches: the orchestration lock file, its holder record,
 * and the checks that decide whether the file may be locked.
 *
 * @module lib/host-command-lock/filesystem
 */
import { execFileSync } from "node:child_process";
import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  ftruncateSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  statSync,
  writeSync,
} from "node:fs";

import { DIRECTORY_MODE, FILE_MODE } from "./constants";

/** The advisory record of the run that holds the slot; admission and release never read it. */
export interface HolderRecord {
  readonly runId: string;
  readonly supervisorPid: number;
  readonly workingDirectory: string;
  readonly startedAt: string;
  /** The child's process group, or null before the supervisor has recorded it. */
  readonly childProcessGroup: number | null;
}

export interface HostCommandLockFilesystem {
  /** Creates the missing directories of a lock file's location with the directory mode. */
  ensureDirectory(path: string): void;
  /** Opens the lock file for reading and writing, creating it with the file mode; never follows a symbolic link. */
  openLockFile(path: string): number;
  /** Opens the lock file read-only on a new open file description. */
  openProbe(path: string): number;
  close(fd: number): void;
  ownerOf(fd: number): number;
  isRegularFile(fd: number): boolean;
  /** `<device>:<inode>` of the file an open descriptor refers to. */
  fileIdOfDescriptor(fd: number): string;
  /** `<device>:<inode>` of the file at a path, or undefined when no file is there. */
  fileIdOfPath(path: string): string | undefined;
  isLocalStorage(path: string): boolean;
  /** Rewrites the holder record in place through the locked descriptor. */
  writeHolderRecord(fd: number, record: HolderRecord): void;
}

const MOUNT_COMMAND = "/sbin/mount";
const MOUNT_LINE = /^.+ on (.+) \(([^)]*)\)$/;
const LOCAL_FLAG = "local";
const NOT_FOUND_CODE = "ENOENT";
const ROOT_MOUNT = "/";
const RECORD_OFFSET = 0;

function fileId(stat: { readonly dev: number; readonly ino: number }): string {
  return `${stat.dev}:${stat.ino}`;
}

function mountCovers(mountPoint: string, path: string): boolean {
  return mountPoint === ROOT_MOUNT || path === mountPoint || path.startsWith(`${mountPoint}/`);
}

export const defaultFilesystem: HostCommandLockFilesystem = {
  ensureDirectory: (path) => {
    mkdirSync(path, { recursive: true, mode: DIRECTORY_MODE });
  },
  openLockFile: (path) => openSync(path, fsConstants.O_RDWR | fsConstants.O_CREAT | fsConstants.O_NOFOLLOW, FILE_MODE),
  openProbe: (path) => openSync(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW),
  close: closeSync,
  ownerOf: (fd) => fstatSync(fd).uid,
  isRegularFile: (fd) => fstatSync(fd).isFile(),
  fileIdOfDescriptor: (fd) => fileId(fstatSync(fd)),
  fileIdOfPath: (path) => {
    try {
      return fileId(statSync(path));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === NOT_FOUND_CODE) return undefined;
      throw error;
    }
  },
  isLocalStorage: (path) => {
    const resolved = realpathSync(path);
    const mounts = execFileSync(MOUNT_COMMAND, { encoding: "utf8" })
      .split("\n")
      .flatMap((line) => {
        const match = MOUNT_LINE.exec(line);
        return match === null ? [] : [{ mountPoint: match[1], flags: match[2].split(",").map((flag) => flag.trim()) }];
      })
      .filter((mount) => mountCovers(mount.mountPoint, resolved))
      .sort((a, b) => b.mountPoint.length - a.mountPoint.length);
    return mounts.length > 0 && mounts[0].flags.includes(LOCAL_FLAG);
  },
  writeHolderRecord: (fd, record) => {
    const bytes = Buffer.from(`${JSON.stringify(record)}\n`);
    ftruncateSync(fd, 0);
    writeSync(fd, bytes, 0, bytes.length, RECORD_OFFSET);
  },
};

/** Reads the advisory holder record from the lock file at `lockPath`. */
export function readHolderRecord(lockPath: string): HolderRecord {
  return JSON.parse(readFileSync(lockPath, "utf8")) as HolderRecord;
}
