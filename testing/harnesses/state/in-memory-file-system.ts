import type { StateStoreFileEntry, StateStoreFileSystem } from "@/lib/state-store";

/** Node's "file not found" error code, raised by `readFile` on a missing path. */
const NOT_FOUND_CODE = "ENOENT";

/**
 * A real in-memory `StateStoreFileSystem` for state tests: a Map-backed filesystem
 * that genuinely appends, overwrites, and raises ENOENT on a missing read, so the
 * code under test runs its real paths over an injected boundary rather than a mock.
 * A fresh store over the same instance sees prior writes — the model for reopen.
 */
class InMemoryStateStoreFileSystem implements StateStoreFileSystem {
  private readonly files = new Map<string, string>();

  async mkdir(): Promise<void> {}

  async writeFile(path: string, data: string): Promise<void> {
    this.files.set(path, data);
  }

  async appendFile(path: string, data: string): Promise<void> {
    this.files.set(path, (this.files.get(path) ?? "") + data);
  }

  async readFile(path: string, _encoding: "utf8"): Promise<string> {
    const content = this.files.get(path);
    if (content === undefined) throw Object.assign(new Error(NOT_FOUND_CODE), { code: NOT_FOUND_CODE });
    return content;
  }

  async readdir(): Promise<readonly StateStoreFileEntry[]> {
    return [];
  }
}

export function createInMemoryStateStoreFileSystem(): StateStoreFileSystem {
  return new InMemoryStateStoreFileSystem();
}
