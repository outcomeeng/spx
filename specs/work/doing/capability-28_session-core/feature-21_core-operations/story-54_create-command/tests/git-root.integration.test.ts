/**
 * Integration tests for git root detection (Level 2)
 *
 * Tests real git command execution using withGitEnv harness.
 * Verifies behavior with real git repositories and subdirectories.
 */

import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { detectGitRoot } from "@/git/root";
import { withGitEnv } from "@test/harness/with-git-env";

describe("detectGitRoot", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "git-root-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("GIVEN git repository WHEN detecting from root THEN returns git root path", async () => {
    // Given - create real git repo using withGitEnv
    await withGitEnv(async ({ path }) => {
      // Git repo is already initialized by withGitEnv
      // Resolve canonical path to handle symlinks (/var vs /private/var on macOS)
      const canonicalPath = realpathSync(path);

      // When
      const result = await detectGitRoot(path);

      // Then
      expect(result.root).toBe(canonicalPath);
      expect(result.isGitRepo).toBe(true);
      expect(result.warning).toBeUndefined();
    });
  });

  it("GIVEN git repository WHEN detecting from subdirectory THEN returns repo root not cwd", async () => {
    // Given - create git repo with subdirectory
    await withGitEnv(async ({ path, writeFile }) => {
      // Resolve canonical paths to handle symlinks
      const canonicalPath = realpathSync(path);

      // Create nested subdirectories
      const subdir = join(path, "src", "components");
      await writeFile("src/components/placeholder.txt", "");
      const canonicalSubdir = realpathSync(subdir);

      // When - detect from subdirectory
      const result = await detectGitRoot(subdir);

      // Then - should return repo root, not subdir
      expect(result.root).toBe(canonicalPath);
      expect(result.root).not.toBe(canonicalSubdir);
      expect(result.isGitRepo).toBe(true);
      expect(result.warning).toBeUndefined();
    });
  });

  it("GIVEN NOT a git repository WHEN detecting THEN returns cwd and warning", async () => {
    // Given - non-git directory
    const nonGitDir = join(tempDir, "not-a-repo");
    mkdirSync(nonGitDir);

    // When
    const result = await detectGitRoot(nonGitDir);

    // Then
    expect(result.root).toBe(nonGitDir);
    expect(result.isGitRepo).toBe(false);
    expect(result.warning).toBeDefined();
    expect(result.warning?.toLowerCase()).toContain("not");
    expect(result.warning?.toLowerCase()).toContain("git");
  });

  it("GIVEN deeply nested subdirectory in git repo WHEN detecting THEN returns repo root", async () => {
    // Given
    await withGitEnv(async ({ path, writeFile }) => {
      // Resolve canonical path to handle symlinks
      const canonicalPath = realpathSync(path);

      // Create deeply nested structure
      const deepDir = join(path, "a", "b", "c", "d");
      await writeFile("a/b/c/d/file.txt", "content");

      // When
      const result = await detectGitRoot(deepDir);

      // Then
      expect(result.root).toBe(canonicalPath);
      expect(result.isGitRepo).toBe(true);
    });
  });

  it("GIVEN git repo WHEN detecting with trailing slash THEN returns normalized path", async () => {
    // Given
    await withGitEnv(async ({ path }) => {
      // Resolve canonical path to handle symlinks
      const canonicalPath = realpathSync(path);
      const pathWithSlash = `${path}/`;

      // When
      const result = await detectGitRoot(pathWithSlash);

      // Then - path should be normalized (no trailing slash)
      expect(result.root).toBe(canonicalPath);
      expect(result.root).not.toContain("//");
    });
  });
});

describe("detectGitRoot with dependency injection", () => {
  it("GIVEN mock execa WHEN detecting THEN uses injected dependency", async () => {
    // Given - mock execa that simulates git success
    let execaCalled = false;
    const mockExeca = async () => {
      execaCalled = true;
      return {
        stdout: "/mocked/repo/path",
        stderr: "",
        exitCode: 0,
      };
    };

    // When
    const result = await detectGitRoot("/any/path", { execa: mockExeca as any });

    // Then
    expect(execaCalled).toBe(true);
    expect(result.root).toBe("/mocked/repo/path");
    expect(result.isGitRepo).toBe(true);
  });

  it("GIVEN mock execa that fails WHEN detecting THEN returns cwd with warning", async () => {
    // Given - mock execa that simulates git failure
    const mockExeca = async () => {
      const error: any = new Error("not a git repository");
      error.exitCode = 128;
      throw error;
    };

    const cwd = "/not/a/repo";

    // When
    const result = await detectGitRoot(cwd, { execa: mockExeca as any });

    // Then
    expect(result.root).toBe(cwd);
    expect(result.isGitRepo).toBe(false);
    expect(result.warning).toBeDefined();
  });
});
