/**
 * Unit Tests for Settings File Discovery
 *
 * Tests recursive discovery of .claude/settings.local.json files.
 * Level 1: File I/O with Node.js built-ins and temp fixtures.
 */

import { findSettingsFiles, isValidSettingsFile } from "@/lib/claude/permissions/discovery";
import { withPermissionsTempDir } from "@testing/harnesses/claude/permissions/temp-directory";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

// ============================================================================
// isValidSettingsFile() Tests
// ============================================================================

describe("isValidSettingsFile", () => {
  test("returns true for valid settings file", async () => {
    await withPermissionsTempDir(async (productDir) => {
      const settingsPath = join(productDir, "settings.local.json");
      await writeFile(settingsPath, JSON.stringify({ permissions: {} }));
      const result = await isValidSettingsFile(settingsPath);

      expect(result).toBe(true);
    });
  });

  test("returns false for non-existent file", async () => {
    const result = await isValidSettingsFile("/nonexistent/settings.local.json");

    expect(result).toBe(false);
  });

  test("returns false for directory with .json extension", async () => {
    await withPermissionsTempDir(async (productDir) => {
      const dirPath = join(productDir, "fake.json");
      await mkdir(dirPath);
      const result = await isValidSettingsFile(dirPath);

      expect(result).toBe(false);
    });
  });

  test("returns false for file without .json extension", async () => {
    await withPermissionsTempDir(async (productDir) => {
      const filePath = join(productDir, "settings.txt");
      await writeFile(filePath, "content");
      const result = await isValidSettingsFile(filePath);

      expect(result).toBe(false);
    });
  });

  test("returns true for empty .json file", async () => {
    await withPermissionsTempDir(async (productDir) => {
      const settingsPath = join(productDir, "settings.local.json");
      await writeFile(settingsPath, "");
      const result = await isValidSettingsFile(settingsPath);

      expect(result).toBe(true);
    });
  });
});

// ============================================================================
// findSettingsFiles() Tests
// ============================================================================

describe("findSettingsFiles", () => {
  test("finds settings.local.json in single .claude directory", async () => {
    await withPermissionsTempDir(async (productDir) => {
      const claudeDir = join(productDir, "project", ".claude");
      const settingsPath = join(claudeDir, "settings.local.json");
      await mkdir(claudeDir, { recursive: true });
      await writeFile(settingsPath, JSON.stringify({ permissions: {} }));
      const result = await findSettingsFiles(productDir);

      expect(result).toHaveLength(1);
      expect(result[0]).toBe(settingsPath);
    });
  });

  test("finds settings files in multiple projects", async () => {
    await withPermissionsTempDir(async (productDir) => {
      const projectA = join(productDir, "project-a", ".claude");
      const projectB = join(productDir, "project-b", ".claude");
      await mkdir(projectA, { recursive: true });
      await mkdir(projectB, { recursive: true });
      const settingsA = join(projectA, "settings.local.json");
      const settingsB = join(projectB, "settings.local.json");
      await writeFile(settingsA, JSON.stringify({ permissions: {} }));
      await writeFile(settingsB, JSON.stringify({ permissions: {} }));
      const result = await findSettingsFiles(productDir);

      expect(result).toHaveLength(2);
      expect(result).toContain(settingsA);
      expect(result).toContain(settingsB);
    });
  });

  test("finds settings files in nested directories", async () => {
    await withPermissionsTempDir(async (productDir) => {
      const level1 = join(productDir, "level1", ".claude");
      const level2 = join(productDir, "level1", "level2", ".claude");
      const level3 = join(productDir, "level1", "level2", "level3", ".claude");
      await mkdir(level1, { recursive: true });
      await mkdir(level2, { recursive: true });
      await mkdir(level3, { recursive: true });
      const settings1 = join(level1, "settings.local.json");
      const settings2 = join(level2, "settings.local.json");
      const settings3 = join(level3, "settings.local.json");
      await writeFile(settings1, "{}");
      await writeFile(settings2, "{}");
      await writeFile(settings3, "{}");
      const result = await findSettingsFiles(productDir);

      expect(result).toHaveLength(3);
      expect(result).toContain(settings1);
      expect(result).toContain(settings2);
      expect(result).toContain(settings3);
    });
  });

  test("returns empty array for directory without settings files", async () => {
    await withPermissionsTempDir(async (productDir) => {
      await mkdir(join(productDir, "project-a"));
      await mkdir(join(productDir, "project-b"));
      const result = await findSettingsFiles(productDir);

      expect(result).toHaveLength(0);
    });
  });

  test("ignores .claude directory without settings.local.json", async () => {
    await withPermissionsTempDir(async (productDir) => {
      const claudeDir = join(productDir, "project", ".claude");
      await mkdir(claudeDir, { recursive: true });
      await writeFile(join(claudeDir, "other.json"), "{}");
      const result = await findSettingsFiles(productDir);

      expect(result).toHaveLength(0);
    });
  });

  test("ignores settings.local.json outside .claude directory", async () => {
    await withPermissionsTempDir(async (productDir) => {
      await writeFile(join(productDir, "settings.local.json"), "{}");
      const result = await findSettingsFiles(productDir);

      expect(result).toHaveLength(0);
    });
  });

  test("handles symlink loops gracefully", async () => {
    await withPermissionsTempDir(async (productDir) => {
      const dirA = join(productDir, "dir-a");
      const dirB = join(productDir, "dir-b");
      await mkdir(dirA);
      await mkdir(dirB);
      await symlink(dirB, join(dirA, "link-b"), "dir");
      await symlink(dirA, join(dirB, "link-a"), "dir");
      const result = await findSettingsFiles(productDir);

      expect(result).toHaveLength(0);
    });
  });

  test("throws error for non-existent directory", async () => {
    await expect(findSettingsFiles("/nonexistent/directory")).rejects.toThrow(
      "Directory not found",
    );
  });

  test("throws error when path is a file, not a directory", async () => {
    await withPermissionsTempDir(async (productDir) => {
      const filePath = join(productDir, "file.txt");
      await writeFile(filePath, "content");
      await expect(findSettingsFiles(filePath)).rejects.toThrow("Path is not a directory");
    });
  });

  test("skips unreadable directories gracefully", async () => {
    // This test is platform-specific and may not work on all systems
    // Skip on systems where chmod doesn't work as expected
    if (process.platform === "win32") {
      return; // Skip on Windows
    }

    await withPermissionsTempDir(async (productDir) => {
      const unreadableDir = join(productDir, "unreadable");
      await mkdir(unreadableDir);
      await import("node:fs/promises").then((fs) => fs.chmod(unreadableDir, 0o000));
      try {
        await expect(findSettingsFiles(unreadableDir)).rejects.toThrow("Permission denied");
      } finally {
        await import("node:fs/promises").then((fs) => fs.chmod(unreadableDir, 0o700));
      }
    });
  });

  test("handles tilde expansion in path", async () => {
    // This test verifies ~ expansion works, but doesn't actually search home dir
    // Instead, we verify that ~ gets expanded to HOME env var

    const result = await findSettingsFiles("~/.nonexistent-test-dir").catch((e) => e.message);

    // Should contain expanded HOME path, not literal ~
    expect(result).toContain(process.env.HOME || "");
    expect(result).not.toContain("~/.nonexistent");
  });

  test("returns results in consistent order", async () => {
    await withPermissionsTempDir(async (productDir) => {
      for (const name of ["alpha", "beta", "gamma"]) {
        const claudeDir = join(productDir, name, ".claude");
        await mkdir(claudeDir, { recursive: true });
        await writeFile(join(claudeDir, "settings.local.json"), "{}");
      }
      const result1 = await findSettingsFiles(productDir);
      const result2 = await findSettingsFiles(productDir);

      expect(result1).toEqual(result2);
    });
  });

  test("does not recurse into .claude directory itself", async () => {
    await withPermissionsTempDir(async (productDir) => {
      const claudeDir = join(productDir, "project", ".claude");
      await mkdir(claudeDir, { recursive: true });
      await writeFile(join(claudeDir, "settings.local.json"), "{}");
      const subDir = join(claudeDir, "subdir", ".claude");
      await mkdir(subDir, { recursive: true });
      await writeFile(join(subDir, "settings.local.json"), "{}");
      const result = await findSettingsFiles(productDir);

      expect(result).toHaveLength(1);
      expect(result[0]).toBe(join(claudeDir, "settings.local.json"));
    });
  });

  test("handles mixed valid and invalid settings files", async () => {
    await withPermissionsTempDir(async (productDir) => {
      const projectA = join(productDir, "project-a", ".claude");
      await mkdir(projectA, { recursive: true });
      await writeFile(join(projectA, "settings.local.json"), "{}");
      const projectB = join(productDir, "project-b", ".claude");
      await mkdir(projectB, { recursive: true });
      const projectC = join(productDir, "project-c");
      await mkdir(projectC, { recursive: true });
      await writeFile(join(projectC, "settings.local.json"), "{}");
      const projectD = join(productDir, "project-d", ".claude");
      await mkdir(projectD, { recursive: true });
      await writeFile(join(projectD, "settings.local.json"), "{}");
      const result = await findSettingsFiles(productDir);

      expect(result).toHaveLength(2);
      expect(result).toContain(join(projectA, "settings.local.json"));
      expect(result).toContain(join(projectD, "settings.local.json"));
    });
  });

  test("handles deeply nested project structures", async () => {
    await withPermissionsTempDir(async (productDir) => {
      const deepPath = join(productDir, "org", "team", "category", "project", ".claude");
      await mkdir(deepPath, { recursive: true });
      await writeFile(join(deepPath, "settings.local.json"), "{}");
      const result = await findSettingsFiles(productDir);

      expect(result).toHaveLength(1);
      expect(result[0]).toBe(join(deepPath, "settings.local.json"));
    });
  });

  test("handles empty .claude directory", async () => {
    await withPermissionsTempDir(async (productDir) => {
      await mkdir(join(productDir, "project", ".claude"), { recursive: true });
      const result = await findSettingsFiles(productDir);

      expect(result).toHaveLength(0);
    });
  });
});
