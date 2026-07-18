import { dirname } from "node:path";

import {
  ERROR_CODE_FILE_EXISTS,
  ERROR_CODE_NOT_FOUND,
  EXCLUSIVE_CREATE_FLAG,
  type StateStoreFileEntry,
  type StateStoreFileSystem,
  WRITE_EXISTING_FLAG,
} from "@/lib/state-store";

const PATH_SEPARATOR = "/";
const CURRENT_DIRECTORY = ".";
const ROOT_DIRECTORY = "/";

/**
 * A real in-memory `StateStoreFileSystem` for state tests: a Map-backed filesystem
 * that genuinely creates directories, appends, overwrites, honors the exclusive-create
 * flag, raises ENOENT on missing parents and reads, and enumerates directory children
 * — so the code under test runs its real paths over an injected boundary rather than
 * a mock. A fresh store over the same instance sees prior writes, the model for reopen.
 */
class InMemoryStateStoreFileSystem implements StateStoreFileSystem {
  private readonly files = new Map<string, string>();
  private readonly fileBirthtimes = new Map<string, number>();
  private readonly directories = new Set<string>([CURRENT_DIRECTORY, ROOT_DIRECTORY]);
  private nextBirthtimeMs = 0;

  async mkdir(path: string, options?: { readonly recursive?: boolean }): Promise<void> {
    const directory = normalizeDirectoryPath(path);
    if (options?.recursive === true) {
      for (const parent of directoryChain(directory)) {
        this.directories.add(parent);
      }
      return;
    }
    if (!this.directories.has(parentDirectory(directory))) {
      throw Object.assign(new Error(ERROR_CODE_NOT_FOUND), { code: ERROR_CODE_NOT_FOUND });
    }
    this.directories.add(directory);
  }

  async writeFile(path: string, data: string, options?: { readonly flag?: string }): Promise<void> {
    if (!this.directories.has(parentDirectory(path))) {
      throw Object.assign(new Error(ERROR_CODE_NOT_FOUND), { code: ERROR_CODE_NOT_FOUND });
    }
    if (options?.flag === EXCLUSIVE_CREATE_FLAG && this.files.has(path)) {
      throw Object.assign(new Error(ERROR_CODE_FILE_EXISTS), { code: ERROR_CODE_FILE_EXISTS });
    }
    if (options?.flag === WRITE_EXISTING_FLAG && !this.files.has(path)) {
      throw Object.assign(new Error(ERROR_CODE_NOT_FOUND), { code: ERROR_CODE_NOT_FOUND });
    }
    if (!this.files.has(path)) {
      this.fileBirthtimes.set(path, this.nextBirthtimeMs);
      this.nextBirthtimeMs += 1;
    }
    this.files.set(path, data);
  }

  async appendFile(path: string, data: string): Promise<void> {
    if (!this.directories.has(parentDirectory(path))) {
      throw Object.assign(new Error(ERROR_CODE_NOT_FOUND), { code: ERROR_CODE_NOT_FOUND });
    }
    if (!this.files.has(path)) {
      this.fileBirthtimes.set(path, this.nextBirthtimeMs);
      this.nextBirthtimeMs += 1;
    }
    this.files.set(path, (this.files.get(path) ?? "") + data);
  }

  async readFile(path: string, _encoding: "utf8"): Promise<string> {
    const content = this.files.get(path);
    if (content === undefined) throw Object.assign(new Error(ERROR_CODE_NOT_FOUND), { code: ERROR_CODE_NOT_FOUND });
    return content;
  }

  async link(existingPath: string, newPath: string): Promise<void> {
    const content = this.files.get(existingPath);
    if (content === undefined) throw Object.assign(new Error(ERROR_CODE_NOT_FOUND), { code: ERROR_CODE_NOT_FOUND });
    if (!this.directories.has(parentDirectory(newPath))) {
      throw Object.assign(new Error(ERROR_CODE_NOT_FOUND), { code: ERROR_CODE_NOT_FOUND });
    }
    if (this.files.has(newPath)) {
      throw Object.assign(new Error(ERROR_CODE_FILE_EXISTS), { code: ERROR_CODE_FILE_EXISTS });
    }
    this.fileBirthtimes.set(newPath, this.fileBirthtimes.get(existingPath) ?? this.nextBirthtimeMs);
    this.files.set(newPath, content);
  }

  async rename(from: string, to: string): Promise<void> {
    const content = this.files.get(from);
    if (content === undefined) throw Object.assign(new Error(ERROR_CODE_NOT_FOUND), { code: ERROR_CODE_NOT_FOUND });
    if (!this.directories.has(parentDirectory(to))) {
      throw Object.assign(new Error(ERROR_CODE_NOT_FOUND), { code: ERROR_CODE_NOT_FOUND });
    }
    this.files.delete(from);
    const birthtimeMs = this.fileBirthtimes.get(from);
    this.fileBirthtimes.delete(from);
    if (birthtimeMs !== undefined) {
      this.fileBirthtimes.set(to, birthtimeMs);
    }
    this.files.set(to, content);
  }

  async rm(path: string, options?: { readonly force?: boolean }): Promise<void> {
    if (this.files.delete(path)) {
      this.fileBirthtimes.delete(path);
      return;
    }

    const directory = normalizeDirectoryPath(path);
    if (this.directories.delete(directory)) {
      // The harness removes descendants because state tests use directory removal as fixture cleanup.
      for (const directoryPath of [...this.directories]) {
        if (directoryPath.startsWith(directoryChildPrefix(directory))) {
          this.directories.delete(directoryPath);
        }
      }
      for (const filePath of [...this.files.keys()]) {
        if (filePath.startsWith(directoryChildPrefix(directory))) {
          this.files.delete(filePath);
          this.fileBirthtimes.delete(filePath);
        }
      }
      return;
    }

    if (options?.force === true) {
      return;
    }
    throw Object.assign(new Error(ERROR_CODE_NOT_FOUND), { code: ERROR_CODE_NOT_FOUND });
  }

  async lstat(path: string): Promise<{
    readonly birthtimeMs: number;
    isDirectory(): boolean;
    isFile(): boolean;
    isSymbolicLink(): boolean;
  }> {
    if (this.files.has(path)) {
      return {
        birthtimeMs: this.fileBirthtimes.get(path) ?? 0,
        isDirectory: () => false,
        isFile: () => true,
        isSymbolicLink: () => false,
      };
    }
    if (this.directories.has(normalizeDirectoryPath(path))) {
      return { birthtimeMs: 0, isDirectory: () => true, isFile: () => false, isSymbolicLink: () => false };
    }
    throw Object.assign(new Error(ERROR_CODE_NOT_FOUND), { code: ERROR_CODE_NOT_FOUND });
  }

  async readdir(path: string, _options: { readonly withFileTypes: true }): Promise<readonly StateStoreFileEntry[]> {
    const directory = normalizeDirectoryPath(path);
    if (!this.directories.has(directory)) {
      throw Object.assign(new Error(ERROR_CODE_NOT_FOUND), { code: ERROR_CODE_NOT_FOUND });
    }
    const prefix = directoryChildPrefix(directory);
    const directFiles = collectDirectChildNames(this.files.keys(), prefix);
    const subdirectories = collectDirectoryChildNames(this.files.keys(), this.directories, directory, prefix);
    return [
      ...[...directFiles].map((name): StateStoreFileEntry => ({ name, isFile: () => true })),
      ...[...subdirectories].map((name): StateStoreFileEntry => ({ name, isFile: () => false })),
    ];
  }
}

export function createInMemoryStateStoreFileSystem(): StateStoreFileSystem {
  return new InMemoryStateStoreFileSystem();
}

export function createDelegatingStateStoreFileSystem(
  delegate: StateStoreFileSystem,
  overrides: Partial<StateStoreFileSystem>,
): StateStoreFileSystem {
  return {
    mkdir: (path, options) => delegate.mkdir(path, options),
    writeFile: (path, data, options) => delegate.writeFile(path, data, options),
    appendFile: (path, data) => delegate.appendFile(path, data),
    readFile: (path, encoding) => delegate.readFile(path, encoding),
    readdir: (path, options) => delegate.readdir(path, options),
    lstat: (path) => delegate.lstat(path),
    link: (existingPath, newPath) => delegate.link(existingPath, newPath),
    rename: (from, to) => delegate.rename(from, to),
    rm: (path, options) => delegate.rm(path, options),
    ...overrides,
  };
}

function parentDirectory(path: string): string {
  return normalizeDirectoryPath(dirname(path));
}

function normalizeDirectoryPath(path: string): string {
  const trimmed = path.endsWith(PATH_SEPARATOR) && path.length > ROOT_DIRECTORY.length
    ? path.slice(0, -PATH_SEPARATOR.length)
    : path;
  return trimmed.length === 0 ? CURRENT_DIRECTORY : trimmed;
}

function directoryChildPrefix(directory: string): string {
  return directory === CURRENT_DIRECTORY || directory === ROOT_DIRECTORY
    ? directory
    : `${directory}${PATH_SEPARATOR}`;
}

function collectDirectChildNames(paths: Iterable<string>, prefix: string): Set<string> {
  const names = new Set<string>();
  for (const path of paths) {
    const name = directChildName(path, prefix);
    if (name !== undefined) names.add(name);
  }
  return names;
}

function collectDirectoryChildNames(
  filePaths: Iterable<string>,
  directoryPaths: Iterable<string>,
  directory: string,
  prefix: string,
): Set<string> {
  const names = collectNestedParentNames(filePaths, prefix);
  for (const directoryPath of directoryPaths) {
    if (directoryPath === directory) continue;
    const name = childName(directoryPath, prefix);
    if (name !== undefined) names.add(name);
  }
  return names;
}

function collectNestedParentNames(paths: Iterable<string>, prefix: string): Set<string> {
  const names = new Set<string>();
  for (const path of paths) {
    const remainder = childRemainder(path, prefix);
    const separatorIndex = remainder?.indexOf(PATH_SEPARATOR);
    if (remainder !== undefined && separatorIndex !== undefined && separatorIndex >= 0) {
      names.add(remainder.slice(0, separatorIndex));
    }
  }
  return names;
}

function directChildName(path: string, prefix: string): string | undefined {
  const remainder = childRemainder(path, prefix);
  if (remainder === undefined || remainder.includes(PATH_SEPARATOR)) return undefined;
  return remainder;
}

function childName(path: string, prefix: string): string | undefined {
  const remainder = childRemainder(path, prefix);
  if (remainder === undefined || remainder.length === 0) return undefined;
  const separatorIndex = remainder.indexOf(PATH_SEPARATOR);
  return separatorIndex === -1 ? remainder : remainder.slice(0, separatorIndex);
}

function childRemainder(path: string, prefix: string): string | undefined {
  return path.startsWith(prefix) ? path.slice(prefix.length) : undefined;
}

function directoryChain(path: string): readonly string[] {
  const directories: string[] = [];
  let current = normalizeDirectoryPath(path);
  while (!directories.includes(current)) {
    directories.unshift(current);
    const parent = parentDirectory(current);
    if (parent === current) break;
    current = parent;
  }
  return directories;
}
