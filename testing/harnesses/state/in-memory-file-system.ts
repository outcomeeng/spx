import {
  ERROR_CODE_FILE_EXISTS,
  ERROR_CODE_NOT_FOUND,
  EXCLUSIVE_CREATE_FLAG,
  type StateStoreFileEntry,
  type StateStoreFileSystem,
} from "@/lib/state-store";

const PATH_SEPARATOR = "/";

/**
 * A real in-memory `StateStoreFileSystem` for state tests: a Map-backed filesystem
 * that genuinely appends, overwrites, honors the exclusive-create flag, raises ENOENT
 * on a missing read, and enumerates directory children — so the code under test runs
 * its real paths over an injected boundary rather than a mock. A fresh store over the
 * same instance sees prior writes, the model for reopen.
 */
class InMemoryStateStoreFileSystem implements StateStoreFileSystem {
  private readonly files = new Map<string, string>();

  async mkdir(_path: string, _options?: { readonly recursive?: boolean }): Promise<void> {}

  async writeFile(path: string, data: string, options?: { readonly flag?: string }): Promise<void> {
    if (options?.flag === EXCLUSIVE_CREATE_FLAG && this.files.has(path)) {
      throw Object.assign(new Error(ERROR_CODE_FILE_EXISTS), { code: ERROR_CODE_FILE_EXISTS });
    }
    this.files.set(path, data);
  }

  async appendFile(path: string, data: string): Promise<void> {
    this.files.set(path, (this.files.get(path) ?? "") + data);
  }

  async readFile(path: string, _encoding: "utf8"): Promise<string> {
    const content = this.files.get(path);
    if (content === undefined) throw Object.assign(new Error(ERROR_CODE_NOT_FOUND), { code: ERROR_CODE_NOT_FOUND });
    return content;
  }

  async readdir(path: string, _options: { readonly withFileTypes: true }): Promise<readonly StateStoreFileEntry[]> {
    const prefix = path.endsWith(PATH_SEPARATOR) ? path : `${path}${PATH_SEPARATOR}`;
    const directFiles = new Set<string>();
    const subdirectories = new Set<string>();
    for (const filePath of this.files.keys()) {
      if (!filePath.startsWith(prefix)) continue;
      const rest = filePath.slice(prefix.length);
      const separatorIndex = rest.indexOf(PATH_SEPARATOR);
      if (separatorIndex === -1) directFiles.add(rest);
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
