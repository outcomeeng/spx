# ADR 003: Atomic Writes with Temp Files

## Problem

When writing consolidated permissions to `~/.claude/settings.json`, the process could crash mid-write, leaving a corrupted file that breaks Claude Code. This is unacceptable for a critical configuration file.

## Context

- **Business**: Users need reliability; corrupted settings files could break their entire Claude Code setup
- **Technical**: Filesystem writes are not atomic by default; `fs.writeFile()` can fail halfway through, leaving partial content

## Decision

**Use write-then-rename pattern with dependency injection: write consolidated settings to a temp file first, then atomically rename to target path. Use dependency injection to enable testability without mocking.**

## Rationale

Three alternatives were considered:

1. **Direct write** (`fs.writeFile()` to target) — Rejected because it's not atomic; crash during write corrupts file
2. **Write-then-copy** — Rejected because copy is not atomic; still vulnerable to corruption
3. **Write-then-rename with DI** — Chosen because:
   - `fs.rename()` is atomic on most filesystems (POSIX guarantees)
   - Temp file isolated from production path
   - Failure leaves original file intact
   - Standard pattern used by Git, databases, and other critical tools
   - Dependency injection enables testing error paths without mocking

Implementation pattern:

```typescript
import { rename, unlink, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

// Filesystem abstraction for dependency injection
interface FileSystem {
  writeFile(path: string, content: string): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  unlink(path: string): Promise<void>;
}

// Production implementation uses real fs
const realFs: FileSystem = {
  writeFile: (path, content) => writeFile(path, content, "utf8"),
  rename,
  unlink,
};

async function writeSettings(
  filePath: string,
  settings: ClaudeSettings,
  deps: { fs: FileSystem } = { fs: realFs },
): Promise<void> {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  const tempPath = join(tmpdir(), `settings-${timestamp}-${random}.json`);

  try {
    // Step 1: Write to temp file
    const content = JSON.stringify(settings, null, 2) + "\n";
    await deps.fs.writeFile(tempPath, content);

    // Step 2: Atomic rename to target
    await deps.fs.rename(tempPath, filePath);
  } catch (error) {
    // Cleanup temp file on failure
    try {
      await deps.fs.unlink(tempPath);
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}
```

## Trade-offs Accepted

- **Cross-filesystem moves**: If temp directory and target are on different filesystems, rename may fail. Mitigation: Catch error and fall back to copy + unlink (rare case, worth handling).
- **Temp file cleanup**: On crash, temp files may remain in tmpdir. Mitigation: OS typically cleans tmpdir periodically; use timestamped names to allow manual cleanup.
- **Windows behavior**: Rename may not be atomic on all Windows filesystems. Mitigation: Document limitation; still better than direct write.
- **Dependency injection overhead**: Requires passing deps parameter. Mitigation: Default parameter makes it optional; production code unchanged.

## Testing Strategy

### Level Coverage

| Level           | Question Answered                                      | Scope                           |
| --------------- | ------------------------------------------------------ | ------------------------------- |
| 1 (Unit)        | Does write function handle errors correctly?           | `writeSettings()` with DI       |
| 2 (Integration) | Does full pipeline write correctly without corruption? | End-to-end with real filesystem |

### Escalation Rationale

- **1 → 2**: Unit tests verify error handling logic with injected dependencies, but integration tests verify real filesystem behavior including permission errors

### Test Harness

| Level | Harness          | Location/Dependency                  |
| ----- | ---------------- | ------------------------------------ |
| 1     | Vitest + DI      | Injected FileSystem implementation   |
| 2     | Temp directories | `fs.promises.mkdtemp()` + real files |

### Behaviors Verified

**Level 1 (Unit with Dependency Injection):**

```typescript
import { describe, expect, test } from "vitest";

describe("writeSettings - Error Handling", () => {
  test("cleans up temp file on write error", async () => {
    const writtenFiles: string[] = [];
    const deletedFiles: string[] = [];

    const testFs: FileSystem = {
      async writeFile(path: string, content: string) {
        writtenFiles.push(path);
        throw new Error("ENOSPC: no space left on device");
      },
      async rename() {
        throw new Error("Should not be called");
      },
      async unlink(path: string) {
        deletedFiles.push(path);
      },
    };

    const mockSettings: ClaudeSettings = {
      permissions: { allow: ["Bash(git:*)"] },
    };

    await expect(
      writeSettings("/target/settings.json", mockSettings, { fs: testFs }),
    ).rejects.toThrow("ENOSPC");

    expect(writtenFiles).toHaveLength(1); // Temp file was written
    expect(deletedFiles).toEqual(writtenFiles); // Temp file was cleaned up
  });

  test("propagates rename errors", async () => {
    const testFs: FileSystem = {
      async writeFile() {
        // Success
      },
      async rename() {
        throw new Error("EXDEV: cross-device link not permitted");
      },
      async unlink() {
        // Cleanup
      },
    };

    const mockSettings: ClaudeSettings = {
      permissions: { allow: ["Bash(git:*)"] },
    };

    await expect(
      writeSettings("/target/settings.json", mockSettings, { fs: testFs }),
    ).rejects.toThrow("EXDEV");
  });

  test("generates unique temp file names", async () => {
    const tempPaths: string[] = [];

    const testFs: FileSystem = {
      async writeFile(path: string) {
        tempPaths.push(path);
      },
      async rename() {
        // Success
      },
      async unlink() {
        // Not called on success
      },
    };

    const mockSettings: ClaudeSettings = {
      permissions: { allow: ["Bash(git:*)"] },
    };

    // Call multiple times
    await writeSettings("/target/settings.json", mockSettings, { fs: testFs });
    await writeSettings("/target/settings.json", mockSettings, { fs: testFs });

    // Verify unique names
    expect(tempPaths).toHaveLength(2);
    expect(tempPaths[0]).not.toEqual(tempPaths[1]);
    expect(tempPaths[0]).toMatch(/settings-\d+-[a-z0-9]+\.json$/);
  });

  test("preserves JSON formatting", async () => {
    let writtenContent = "";

    const testFs: FileSystem = {
      async writeFile(path: string, content: string) {
        writtenContent = content;
      },
      async rename() {
        // Success
      },
      async unlink() {
        // Not called on success
      },
    };

    const mockSettings: ClaudeSettings = {
      permissions: {
        allow: ["Bash(git:*)", "Bash(npm:*)"],
      },
    };

    await writeSettings("/target/settings.json", mockSettings, { fs: testFs });

    // Verify 2-space indent and trailing newline
    expect(writtenContent).toContain("  \"permissions\"");
    expect(writtenContent).toEndWith("\n");
    expect(JSON.parse(writtenContent)).toEqual(mockSettings);
  });
});
```

**Level 2 (Integration with Real Filesystem):**

```typescript
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, test } from "vitest";

describe("Atomic Write Integration", () => {
  test("writes settings correctly", async () => {
    const testDir = await mkdtemp(join(tmpdir(), "atomic-test-"));

    try {
      const settingsPath = join(testDir, "settings.json");
      const settings: ClaudeSettings = {
        permissions: {
          allow: ["Bash(git:*)"],
        },
      };

      await writeSettings(settingsPath, settings);

      // Verify file exists and has correct content
      const content = await readFile(settingsPath, "utf8");
      const parsed = JSON.parse(content);

      expect(parsed.permissions.allow).toEqual(["Bash(git:*)"]);
    } finally {
      await rm(testDir, { recursive: true });
    }
  });

  test("overwrites existing file atomically", async () => {
    const testDir = await mkdtemp(join(tmpdir(), "atomic-test-"));

    try {
      const settingsPath = join(testDir, "settings.json");

      // Write initial file
      await writeFile(settingsPath, JSON.stringify({ old: true }));

      // Overwrite with new settings
      const settings: ClaudeSettings = {
        permissions: {
          allow: ["Bash(npm:*)"],
        },
      };
      await writeSettings(settingsPath, settings);

      // Verify new content
      const content = await readFile(settingsPath, "utf8");
      const parsed = JSON.parse(content);

      expect(parsed.old).toBeUndefined();
      expect(parsed.permissions.allow).toEqual(["Bash(npm:*)"]);
    } finally {
      await rm(testDir, { recursive: true });
    }
  });

  test("handles permission denied gracefully", async () => {
    const testDir = await mkdtemp(join(tmpdir(), "atomic-test-"));

    try {
      const readOnlyDir = join(testDir, "readonly");
      await mkdir(readOnlyDir, { mode: 0o444 }); // Read-only directory

      const settingsPath = join(readOnlyDir, "settings.json");
      const mockSettings: ClaudeSettings = {
        permissions: { allow: ["Bash(git:*)"] },
      };

      await expect(writeSettings(settingsPath, mockSettings)).rejects.toThrow(
        /EACCES|permission denied/i,
      );

      // Verify no partial writes
      const files = await readdir(readOnlyDir);
      expect(files).toHaveLength(0);
    } finally {
      // Restore permissions before cleanup
      await chmod(join(testDir, "readonly"), 0o755);
      await rm(testDir, { recursive: true });
    }
  });

  test("preserves original file on write failure", async () => {
    const testDir = await mkdtemp(join(tmpdir(), "atomic-test-"));

    try {
      const settingsPath = join(testDir, "settings.json");

      // Write initial file
      const originalContent = JSON.stringify({ original: true }, null, 2);
      await writeFile(settingsPath, originalContent);

      // Attempt to write to read-only file
      await chmod(settingsPath, 0o444); // Make file read-only

      const mockSettings: ClaudeSettings = {
        permissions: { allow: ["Bash(git:*)"] },
      };

      // This should fail during rename
      await expect(writeSettings(settingsPath, mockSettings)).rejects.toThrow();

      // Restore permissions to read file
      await chmod(settingsPath, 0o644);

      // Verify original file unchanged
      const content = await readFile(settingsPath, "utf8");
      expect(content).toEqual(originalContent);
    } finally {
      // Restore permissions before cleanup
      try {
        await chmod(join(testDir, "settings.json"), 0o644);
      } catch {
        // May not exist
      }
      await rm(testDir, { recursive: true });
    }
  });
});
```

## Validation

### How to Recognize Compliance

You're following this decision if:

- Settings writes use temp file + rename pattern
- `writeSettings()` accepts `deps` parameter with `FileSystem` interface
- Temp files created in `tmpdir()` with unique names
- Original file only modified after successful temp file write
- Errors leave original file unchanged
- Unit tests use dependency injection, not mocking

### MUST

- Write to temp file first, then rename to target
- Use unique temp file names (timestamp + random)
- Clean up temp files on error
- Create backup before any modification
- Preserve exact JSON formatting (2-space indent, trailing newline)
- Use dependency injection for testability
- Test error paths with injected FileSystem at Level 1
- Test real filesystem errors (permissions, disk full) at Level 2

### NEVER

- Write directly to target file path
- Use fixed temp file names (race conditions)
- Leave temp files on success
- Modify settings.json without backup
- Assume rename is always atomic (handle cross-filesystem case)
- Mock filesystem operations in tests - use dependency injection instead
