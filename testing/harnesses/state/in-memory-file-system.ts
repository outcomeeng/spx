import { dirname } from "node:path";

import {
  ERROR_CODE_FILE_EXISTS,
  ERROR_CODE_NOT_FOUND,
  EXCLUSIVE_CREATE_FLAG,
  WRITE_EXISTING_FLAG,
  type StateStoreFileEntry,
  type StateStoreFileSystem,
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
  private readonly directories = new Set<string>([CURRENT_DIRECTORY, ROOT_DIRECTORY]);

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
    this.files.set(path, data);
  }

  async appendFile(path: string, data: string): Promise<void> {
    if (!this.directories.has(parentDirectory(path))) {
      throw Object.assign(new Error(ERROR_CODE_NOT_FOUND), { code: ERROR_CODE_NOT_FOUND });
    }
    this.files.set(path, (this.files.get(path) ?? "") + data);
  }

  async readFile(path: string, _encoding: "utf8"): Promise<string> {
    const content = this.files.get(path);
    if (content === undefined) throw Object.assign(new Error(ERROR_CODE_NOT_FOUND), { code: ERROR_CODE_NOT_FOUND });
    return content;
  }

  async rm(path: string, options?: { readonly force?: boolean }): Promise<void> {
    if (this.files.delete(path) || this.directories.delete(normalizeDirectoryPath(path)) || options?.force === true) return;
    throw Object.assign(new Error(ERROR_CODE_NOT_FOUND), { code: ERROR_CODE_NOT_FOUND });
  }

  async lstat(path: string): Promise<{
    isDirectory(): boolean;
    isFile(): boolean;
    isSymbolicLink(): boolean;
  }> {
    if (this.files.has(path)) {
      return { isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false };
    }
    if (this.directories.has(normalizeDirectoryPath(path))) {
      return { isDirectory: () => true, isFile: () => false, isSymbolicLink: () => false };
    }
    throw Object.assign(new Error(ERROR_CODE_NOT_FOUND), { code: ERROR_CODE_NOT_FOUND });
  }

  async readdir(path: string, _options: { readonly withFileTypes: true }): Promise<readonly StateStoreFileEntry[]> {
    const directory = normalizeDirectoryPath(path);
    if (!this.directories.has(directory)) {
      throw Object.assign(new Error(ERROR_CODE_NOT_FOUND), { code: ERROR_CODE_NOT_FOUND });
    }
    const prefix = directory === CURRENT_DIRECTORY || directory === ROOT_DIRECTORY
      ? directory
      : `${directory}${PATH_SEPARATOR}`;
    const directFiles = new Set<string>();
    const subdirectories = new Set<string>();
    for (const filePath of this.files.keys()) {
      if (!filePath.startsWith(prefix)) continue;
      const rest = filePath.slice(prefix.length);
      const separatorIndex = rest.indexOf(PATH_SEPARATOR);
      if (separatorIndex === -1) directFiles.add(rest);
      else subdirectories.add(rest.slice(0, separatorIndex));
    }
    for (const directoryPath of this.directories) {
      if (directoryPath === directory || !directoryPath.startsWith(prefix)) continue;
      const rest = directoryPath.slice(prefix.length);
      if (rest.length === 0) continue;
      const separatorIndex = rest.indexOf(PATH_SEPARATOR);
      if (separatorIndex === -1) subdirectories.add(rest);
      else subdirectories.add(rest.slice(0, separatorIndex));
    }
    return [
      ...[...directFiles].map((name): StateStoreFileEntry => ({ name, isFile: () => true })),
      ...[...subdirectories].map((name): StateStoreFileEntry => ({ name, isFile: () => false })),
    ];
  }
}

export function createInMemoryStateStoreFileSystem(): StateStoreFileSystem {
  return new InMemoryStateStoreFileSystem();
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
