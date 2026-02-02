/**
 * Unit tests for git root detection and path construction (Level 1)
 *
 * Tests pure functions that construct paths from git root and config.
 * Uses dependency injection - no real git execution at this level.
 */

import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { DEFAULT_CONFIG } from "@/config/defaults";
import { buildSessionPathFromRoot } from "@/git/root";
import { DEFAULT_SESSION_CONFIG } from "@/session/show";

describe("buildSessionPathFromRoot", () => {
  it("GIVEN git root and session ID WHEN building path THEN returns path at git root", () => {
    // Given
    const gitRoot = "/Users/dev/myproject";
    const sessionId = "2026-01-13_08-01-05";
    const config = DEFAULT_SESSION_CONFIG;

    // When
    const result = buildSessionPathFromRoot(gitRoot, sessionId, config);

    // Then - path should be at git root, not cwd
    const expected = join(
      gitRoot,
      DEFAULT_CONFIG.sessions.dir,
      DEFAULT_CONFIG.sessions.statusDirs.todo,
      `${sessionId}.md`,
    );
    expect(result).toBe(expected);
  });

  it("GIVEN different git root WHEN building path THEN path is relative to that root", () => {
    // Given
    const gitRoot = "/different/path";
    const sessionId = "2026-01-13_08-01-05";
    const config = DEFAULT_SESSION_CONFIG;

    // When
    const result = buildSessionPathFromRoot(gitRoot, sessionId, config);

    // Then - verify all components are from config
    expect(result).toContain(gitRoot);
    expect(result).toContain(DEFAULT_CONFIG.sessions.dir);
    expect(result).toContain(DEFAULT_CONFIG.sessions.statusDirs.todo);
    expect(result).toContain(sessionId);
  });

  it("GIVEN absolute git root WHEN building path THEN returns absolute path", () => {
    // Given
    const gitRoot = "/absolute/repo/path";
    const sessionId = "2026-01-13_08-01-05";
    const config = DEFAULT_SESSION_CONFIG;

    // When
    const result = buildSessionPathFromRoot(gitRoot, sessionId, config);

    // Then
    expect(result).toMatch(/^\//); // starts with /
    expect(result).toContain(gitRoot);
  });
});

describe("DEFAULT_SESSION_CONFIG derivation", () => {
  it("GIVEN DEFAULT_CONFIG WHEN deriving session config THEN uses config values", () => {
    // Given - DEFAULT_CONFIG already imported
    const { dir, statusDirs } = DEFAULT_CONFIG.sessions;

    // When
    const derived = DEFAULT_SESSION_CONFIG;

    // Then - verify derivation uses config, not hardcoded strings
    expect(derived.todoDir).toBe(join(dir, statusDirs.todo));
    expect(derived.doingDir).toBe(join(dir, statusDirs.doing));
    expect(derived.archiveDir).toBe(join(dir, statusDirs.archive));
  });

  it("GIVEN DEFAULT_SESSION_CONFIG WHEN checking paths THEN no hardcoded .spx strings", () => {
    // Then - paths are constructed from config
    const config = DEFAULT_SESSION_CONFIG;

    // Verify all paths contain the base dir from config
    expect(config.todoDir).toContain(DEFAULT_CONFIG.sessions.dir);
    expect(config.doingDir).toContain(DEFAULT_CONFIG.sessions.dir);
    expect(config.archiveDir).toContain(DEFAULT_CONFIG.sessions.dir);
  });

  it("GIVEN statusDirs in config WHEN deriving THEN uses correct status subdirectories", () => {
    // Given
    const { statusDirs } = DEFAULT_CONFIG.sessions;

    // When
    const config = DEFAULT_SESSION_CONFIG;

    // Then - verify each status dir is correctly derived
    expect(config.todoDir).toContain(statusDirs.todo);
    expect(config.doingDir).toContain(statusDirs.doing);
    expect(config.archiveDir).toContain(statusDirs.archive);
  });
});
