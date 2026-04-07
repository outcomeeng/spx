/**
 * Unit Tests for Settings File Discovery
 *
 * Tests recursive discovery of .claude/settings.local.json files.
 * Level 1: File I/O with Node.js built-ins and temp fixtures.
 */

import { findSettingsFiles, isValidSettingsFile } from "@/lib/claude/permissions/discovery.js";
import { mkdir, rm, symlink, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, test } from "vitest";

// ============================================================================
// isValidSettingsFile() Tests
// ============================================================================

describe("isValidSettingsFile", () => {
  test("returns true for valid settings file", async () => {
    const testDir = join(tmpdir(), `discovery-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    const settingsPath = join(testDir, "settings.local.json");

    await writeFile(settingsPath, JSON.stringify({ permissions: {} }));

    try {
      const result = await isValidSettingsFile(settingsPath);

      expect(result).toBe(true);
    } finally {
      await rm(testDir, { recursive: true });
    }
  });

  test("returns false for non-existent file", async () => {
    const result = await isValidSettingsFile("/nonexistent/settings.local.json");

    expect(result).toBe(false);
  });

  test("returns false for directory with .json extension", async () => {
    const testDir = join(tmpdir(), `discovery-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    const dirPath = join(testDir, "fake.json");

    await mkdir(dirPath);

    try {
      const result = await isValidSettingsFile(dirPath);

      expect(result).toBe(false);
    } finally {
      await rm(testDir, { recursive: true });
    }
  });

  test("returns false for file without .json extension", async () => {
    const testDir = join(tmpdir(), `discovery-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    const filePath = join(testDir, "settings.txt");

    await writeFile(filePath, "content");

    try {
      const result = await isValidSettingsFile(filePath);

      expect(result).toBe(false);
    } finally {
      await rm(testDir, { recursive: true });
    }
  });

  test("returns true for empty .json file", async () => {
    const testDir = join(tmpdir(), `discovery-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    const settingsPath = join(testDir, "settings.local.json");

    await writeFile(settingsPath, "");

    try {
      const result = await isValidSettingsFile(settingsPath);

      expect(result).toBe(true);
    } finally {
      await rm(testDir, { recursive: true });
    }
  });
});

// ============================================================================
// findSettingsFiles() Tests
// ============================================================================

describe("findSettingsFiles", () => {
  test("finds settings.local.json in single .claude directory", async () => {
    const testDir = join(tmpdir(), `discovery-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    const claudeDir = join(testDir, "project", ".claude");
    const settingsPath = join(claudeDir, "settings.local.json");

    await mkdir(claudeDir, { recursive: true });
    await writeFile(settingsPath, JSON.stringify({ permissions: {} }));

    try {
      const result = await findSettingsFiles(testDir);

      expect(result).toHaveLength(1);
      expect(result[0]).toBe(settingsPath);
    } finally {
      await rm(testDir, { recursive: true });
    }
  });

  test("finds settings files in multiple projects", async () => {
    const testDir = join(tmpdir(), `discovery-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    // Create project structure
    const projectA = join(testDir, "project-a", ".claude");
    const projectB = join(testDir, "project-b", ".claude");

    await mkdir(projectA, { recursive: true });
    await mkdir(projectB, { recursive: true });

    const settingsA = join(projectA, "settings.local.json");
    const settingsB = join(projectB, "settings.local.json");

    await writeFile(settingsA, JSON.stringify({ permissions: {} }));
    await writeFile(settingsB, JSON.stringify({ permissions: {} }));

    try {
      const result = await findSettingsFiles(testDir);

      expect(result).toHaveLength(2);
      expect(result).toContain(settingsA);
      expect(result).toContain(settingsB);
    } finally {
      await rm(testDir, { recursive: true });
    }
  });

  test("finds settings files in nested directories", async () => {
    const testDir = join(tmpdir(), `discovery-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    // Create nested structure
    const level1 = join(testDir, "level1", ".claude");
    const level2 = join(testDir, "level1", "level2", ".claude");
    const level3 = join(testDir, "level1", "level2", "level3", ".claude");

    await mkdir(level1, { recursive: true });
    await mkdir(level2, { recursive: true });
    await mkdir(level3, { recursive: true });

    const settings1 = join(level1, "settings.local.json");
    const settings2 = join(level2, "settings.local.json");
    const settings3 = join(level3, "settings.local.json");

    await writeFile(settings1, "{}");
    await writeFile(settings2, "{}");
    await writeFile(settings3, "{}");

    try {
      const result = await findSettingsFiles(testDir);

      expect(result).toHaveLength(3);
      expect(result).toContain(settings1);
      expect(result).toContain(settings2);
      expect(result).toContain(settings3);
    } finally {
      await rm(testDir, { recursive: true });
    }
  });

  test("returns empty array for directory without settings files", async () => {
    const testDir = join(tmpdir(), `discovery-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    await mkdir(join(testDir, "project-a"));
    await mkdir(join(testDir, "project-b"));

    try {
      const result = await findSettingsFiles(testDir);

      expect(result).toHaveLength(0);
    } finally {
      await rm(testDir, { recursive: true });
    }
  });

  test("ignores .claude directory without settings.local.json", async () => {
    const testDir = join(tmpdir(), `discovery-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    const claudeDir = join(testDir, "project", ".claude");
    await mkdir(claudeDir, { recursive: true });

    // Create a different file
    await writeFile(join(claudeDir, "other.json"), "{}");

    try {
      const result = await findSettingsFiles(testDir);

      expect(result).toHaveLength(0);
    } finally {
      await rm(testDir, { recursive: true });
    }
  });

  test("ignores settings.local.json outside .claude directory", async () => {
    const testDir = join(tmpdir(), `discovery-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    await writeFile(join(testDir, "settings.local.json"), "{}");

    try {
      const result = await findSettingsFiles(testDir);

      expect(result).toHaveLength(0);
    } finally {
      await rm(testDir, { recursive: true });
    }
  });

  test("handles symlink loops gracefully", async () => {
    const testDir = join(tmpdir(), `discovery-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    const dirA = join(testDir, "dir-a");
    const dirB = join(testDir, "dir-b");

    await mkdir(dirA);
    await mkdir(dirB);

    // Create circular symlinks: dir-a/link-b -> dir-b, dir-b/link-a -> dir-a
    await symlink(dirB, join(dirA, "link-b"), "dir");
    await symlink(dirA, join(dirB, "link-a"), "dir");

    try {
      // Should not throw or hang
      const result = await findSettingsFiles(testDir);

      expect(result).toHaveLength(0);
    } finally {
      await rm(testDir, { recursive: true });
    }
  });

  test("throws error for non-existent directory", async () => {
    await expect(findSettingsFiles("/nonexistent/directory")).rejects.toThrow(
      "Directory not found",
    );
  });

  test("throws error when path is a file, not a directory", async () => {
    const testDir = join(tmpdir(), `discovery-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    const filePath = join(testDir, "file.txt");

    await writeFile(filePath, "content");

    try {
      await expect(findSettingsFiles(filePath)).rejects.toThrow("Path is not a directory");
    } finally {
      await rm(testDir, { recursive: true });
    }
  });

  test("skips unreadable directories gracefully", async () => {
    // This test is platform-specific and may not work on all systems
    // Skip on systems where chmod doesn't work as expected
    if (process.platform === "win32") {
      return; // Skip on Windows
    }

    const testDir = join(tmpdir(), `discovery-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    const unreadableDir = join(testDir, "unreadable");
    await mkdir(unreadableDir);

    // Make directory unreadable (mode 000)
    await import("fs/promises").then((fs) => fs.chmod(unreadableDir, 0o000));

    try {
      // Should throw permission denied error
      await expect(findSettingsFiles(unreadableDir)).rejects.toThrow("Permission denied");
    } finally {
      // Restore permissions before cleanup
      await import("fs/promises").then((fs) => fs.chmod(unreadableDir, 0o755));
      await rm(testDir, { recursive: true });
    }
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
    const testDir = join(tmpdir(), `discovery-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    // Create multiple projects with predictable names
    for (const name of ["alpha", "beta", "gamma"]) {
      const claudeDir = join(testDir, name, ".claude");
      await mkdir(claudeDir, { recursive: true });
      await writeFile(join(claudeDir, "settings.local.json"), "{}");
    }

    try {
      const result1 = await findSettingsFiles(testDir);
      const result2 = await findSettingsFiles(testDir);

      // Results should be consistent across multiple runs
      expect(result1).toEqual(result2);
    } finally {
      await rm(testDir, { recursive: true });
    }
  });

  test("does not recurse into .claude directory itself", async () => {
    const testDir = join(tmpdir(), `discovery-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    const claudeDir = join(testDir, "project", ".claude");
    await mkdir(claudeDir, { recursive: true });

    // Create settings.local.json in .claude
    await writeFile(join(claudeDir, "settings.local.json"), "{}");

    // Create a subdirectory inside .claude (should not be searched)
    const subDir = join(claudeDir, "subdir", ".claude");
    await mkdir(subDir, { recursive: true });
    await writeFile(join(subDir, "settings.local.json"), "{}");

    try {
      const result = await findSettingsFiles(testDir);

      // Should only find the top-level settings file, not the nested one
      expect(result).toHaveLength(1);
      expect(result[0]).toBe(join(claudeDir, "settings.local.json"));
    } finally {
      await rm(testDir, { recursive: true });
    }
  });

  test("handles mixed valid and invalid settings files", async () => {
    const testDir = join(tmpdir(), `discovery-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    // Project A: valid settings file
    const projectA = join(testDir, "project-a", ".claude");
    await mkdir(projectA, { recursive: true });
    await writeFile(join(projectA, "settings.local.json"), "{}");

    // Project B: .claude directory but no settings file
    const projectB = join(testDir, "project-b", ".claude");
    await mkdir(projectB, { recursive: true });

    // Project C: settings.local.json but not in .claude
    const projectC = join(testDir, "project-c");
    await mkdir(projectC, { recursive: true });
    await writeFile(join(projectC, "settings.local.json"), "{}");

    // Project D: valid settings file
    const projectD = join(testDir, "project-d", ".claude");
    await mkdir(projectD, { recursive: true });
    await writeFile(join(projectD, "settings.local.json"), "{}");

    try {
      const result = await findSettingsFiles(testDir);

      // Should only find project-a and project-d
      expect(result).toHaveLength(2);
      expect(result).toContain(join(projectA, "settings.local.json"));
      expect(result).toContain(join(projectD, "settings.local.json"));
    } finally {
      await rm(testDir, { recursive: true });
    }
  });

  test("handles deeply nested project structures", async () => {
    const testDir = join(tmpdir(), `discovery-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    // Create structure: root/org/team/category/project/.claude/settings.local.json
    const deepPath = join(testDir, "org", "team", "category", "project", ".claude");
    await mkdir(deepPath, { recursive: true });
    await writeFile(join(deepPath, "settings.local.json"), "{}");

    try {
      const result = await findSettingsFiles(testDir);

      expect(result).toHaveLength(1);
      expect(result[0]).toBe(join(deepPath, "settings.local.json"));
    } finally {
      await rm(testDir, { recursive: true });
    }
  });

  test("handles empty .claude directory", async () => {
    const testDir = join(tmpdir(), `discovery-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    const claudeDir = join(testDir, "project", ".claude");
    await mkdir(claudeDir, { recursive: true });

    try {
      const result = await findSettingsFiles(testDir);

      expect(result).toHaveLength(0);
    } finally {
      await rm(testDir, { recursive: true });
    }
  });
});
