/**
 * Example-Based Tests for Subsumption Algorithm
 *
 * Tests specific, known cases to verify subsumption logic works correctly.
 * Complements property-based tests with concrete examples.
 */

import { parsePermission } from "@/lib/claude/permissions/parser";
import { detectSubsumptions, parseScopePattern, removeSubsumed, subsumes } from "@/lib/claude/permissions/subsumption";
import { describe, expect, test } from "vitest";

// ============================================================================
// parseScopePattern() Tests
// ============================================================================

describe("parseScopePattern", () => {
  test.each([
    ["git:*", "command", "git:*"],
    ["file_path:/Users/user/Code/**", "path", "/Users/user/Code/**"],
    ["directory_path:/srv/data/**", "path", "/srv/data/**"],
    ["path:/var/log/**", "path", "/var/log/**"],
    ["domain:github.com", "command", "domain:github.com"],
  ])("parses %s as type %s with pattern %s", (scope, type, pattern) => {
    const result = parseScopePattern(scope);
    expect(result.type).toBe(type);
    expect(result.pattern).toBe(pattern);
  });
});

// ============================================================================
// subsumes() Tests
// ============================================================================

describe("subsumes", () => {
  test.each([
    ["Bash(git:*)", "Bash(git log:*)"],
    ["Bash(git:*)", "Bash(git worktree:*)"],
    ["Bash(npm:*)", "Bash(npm install:*)"],
    ["Bash(ls)", "Bash(ls -la)"],
    ["Read(file_path:/Users/user/Code/**)", "Read(file_path:/Users/user/Code/project-a/**)"],
    ["Read(file_path:/Users/user/**)", "Read(file_path:/Users/user/Code/project-a/**)"],
  ])("%s subsumes %s", (broader, narrower) => {
    const broaderPermission = parsePermission(broader, "allow");
    const narrowerPermission = parsePermission(narrower, "allow");

    expect(subsumes(broaderPermission, narrowerPermission)).toBe(true);
  });

  test.each([
    ["Bash(npm:*)", "Bash(git:*)"],
    ["Read(file_path:/Users/user/Code/**)", "Read(file_path:/Users/other/**)"],
    ["Read(file_path:/Users/user/project-a/**)", "Read(file_path:/Users/user/project-b/**)"],
  ])("%s and %s do not subsume each other", (rawA, rawB) => {
    const permissionA = parsePermission(rawA, "allow");
    const permissionB = parsePermission(rawB, "allow");

    expect(subsumes(permissionA, permissionB)).toBe(false);
    expect(subsumes(permissionB, permissionA)).toBe(false);
  });

  // One command-type and one path-type permission, so identity is exercised for both scope kinds.
  test.each([
    "Bash(git:*)",
    "Read(file_path:/srv/data/**)",
  ])("%s does not subsume itself", (raw) => {
    const permission = parsePermission(raw, "allow");

    expect(subsumes(permission, permission)).toBe(false);
  });

  test.each([
    ["Bash(git:*)", "Read(file_path:/Users/user/Code/**)"],
    ["Read(file_path:/srv/data/**)", "WebFetch(domain:github.com)"],
    ["WebFetch(domain:github.com)", "Bash(curl:*)"],
  ])("%s and %s do not subsume across types", (rawA, rawB) => {
    const permissionA = parsePermission(rawA, "allow");
    const permissionB = parsePermission(rawB, "allow");

    expect(subsumes(permissionA, permissionB)).toBe(false);
    expect(subsumes(permissionB, permissionA)).toBe(false);
  });
});

// ============================================================================
// detectSubsumptions() Tests
// ============================================================================

describe("detectSubsumptions", () => {
  test("finds subsumptions in command permissions", () => {
    const permissions = [
      parsePermission("Bash(git:*)", "allow"),
      parsePermission("Bash(git log:*)", "allow"),
      parsePermission("Bash(git worktree:*)", "allow"),
      parsePermission("Bash(npm:*)", "allow"),
    ];

    const results = detectSubsumptions(permissions);

    expect(results).toHaveLength(1);
    expect(results[0].broader.raw).toBe("Bash(git:*)");
    expect(results[0].narrower).toHaveLength(2);
    expect(results[0].narrower.map((p) => p.raw)).toEqual([
      "Bash(git log:*)",
      "Bash(git worktree:*)",
    ]);
  });

  test("finds subsumptions in path permissions", () => {
    const permissions = [
      parsePermission("Read(file_path:/Users/user/Code/**)", "allow"),
      parsePermission("Read(file_path:/Users/user/Code/project-a/**)", "allow"),
      parsePermission("Read(file_path:/Users/other/**)", "allow"),
    ];

    const results = detectSubsumptions(permissions);

    expect(results).toHaveLength(1);
    expect(results[0].broader.raw).toBe("Read(file_path:/Users/user/Code/**)");
    expect(results[0].narrower).toHaveLength(1);
    expect(results[0].narrower[0].raw).toBe("Read(file_path:/Users/user/Code/project-a/**)");
  });

  test("returns empty array when no subsumptions exist", () => {
    const permissions = [
      parsePermission("Bash(git:*)", "allow"),
      parsePermission("Bash(npm:*)", "allow"),
      parsePermission("Read(file_path:/srv/data/**)", "allow"),
    ];

    const results = detectSubsumptions(permissions);

    expect(results).toHaveLength(0);
  });

  test("handles empty permission list", () => {
    const results = detectSubsumptions([]);

    expect(results).toHaveLength(0);
  });

  test("handles single permission", () => {
    const permissions = [parsePermission("Bash(git:*)", "allow")];

    const results = detectSubsumptions(permissions);

    expect(results).toHaveLength(0);
  });

  test("handles multiple broader permissions", () => {
    const permissions = [
      parsePermission("Bash(git:*)", "allow"),
      parsePermission("Bash(git log:*)", "allow"),
      parsePermission("Bash(npm:*)", "allow"),
      parsePermission("Bash(npm install:*)", "allow"),
    ];

    const results = detectSubsumptions(permissions);

    expect(results).toHaveLength(2);

    // Sort for consistent testing
    results.sort((a, b) => a.broader.raw.localeCompare(b.broader.raw));

    expect(results[0].broader.raw).toBe("Bash(git:*)");
    expect(results[0].narrower).toHaveLength(1);
    expect(results[0].narrower[0].raw).toBe("Bash(git log:*)");

    expect(results[1].broader.raw).toBe("Bash(npm:*)");
    expect(results[1].narrower).toHaveLength(1);
    expect(results[1].narrower[0].raw).toBe("Bash(npm install:*)");
  });
});

// ============================================================================
// removeSubsumed() Tests
// ============================================================================

describe("removeSubsumed", () => {
  test("removes subsumed command permissions", () => {
    const permissions = ["Bash(git:*)", "Bash(git log:*)", "Bash(git worktree:*)", "Bash(npm:*)"];

    const result = removeSubsumed(permissions, "allow");

    expect(result).toHaveLength(2);
    expect(result).toContain("Bash(git:*)");
    expect(result).toContain("Bash(npm:*)");
    expect(result).not.toContain("Bash(git log:*)");
    expect(result).not.toContain("Bash(git worktree:*)");
  });

  test("removes subsumed path permissions", () => {
    const permissions = [
      "Read(file_path:/Users/user/Code/**)",
      "Read(file_path:/Users/user/Code/project-a/**)",
      "Read(file_path:/Users/user/Code/project-b/**)",
      "Read(file_path:/Users/other/**)",
    ];

    const result = removeSubsumed(permissions, "allow");

    expect(result).toHaveLength(2);
    expect(result).toContain("Read(file_path:/Users/user/Code/**)");
    expect(result).toContain("Read(file_path:/Users/other/**)");
    expect(result).not.toContain("Read(file_path:/Users/user/Code/project-a/**)");
    expect(result).not.toContain("Read(file_path:/Users/user/Code/project-b/**)");
  });

  test("returns all permissions when no subsumptions exist", () => {
    const permissions = ["Bash(git:*)", "Bash(npm:*)", "Read(file_path:/srv/data/**)"];

    const result = removeSubsumed(permissions, "allow");

    expect(result).toHaveLength(3);
    expect(result).toEqual(permissions);
  });

  test("handles empty array", () => {
    const result = removeSubsumed([], "allow");

    expect(result).toHaveLength(0);
  });

  test("handles single permission", () => {
    const permissions = ["Bash(git:*)"];

    const result = removeSubsumed(permissions, "allow");

    expect(result).toHaveLength(1);
    expect(result).toEqual(permissions);
  });

  test("handles malformed permissions gracefully", () => {
    const permissions = ["Bash(git:*)", "InvalidFormat", "Bash(git log:*)"];

    const result = removeSubsumed(permissions, "allow");

    // Should keep valid permissions and skip malformed ones
    expect(result).toContain("Bash(git:*)");
    expect(result).toContain("InvalidFormat"); // Kept as-is
    expect(result).not.toContain("Bash(git log:*)"); // Subsumed
  });

  test("preserves order of non-subsumed permissions", () => {
    const permissions = ["Bash(npm:*)", "Bash(git:*)", "Read(file_path:/srv/data/**)"];

    const result = removeSubsumed(permissions, "allow");

    // Order should be preserved
    expect(result).toEqual(permissions);
  });

  test("handles mixed command and path subsumptions", () => {
    const permissions = [
      "Bash(git:*)",
      "Bash(git log:*)",
      "Read(file_path:/Users/user/**)",
      "Read(file_path:/Users/user/Code/**)",
      "WebFetch(domain:github.com)",
    ];

    const result = removeSubsumed(permissions, "allow");

    expect(result).toHaveLength(3);
    expect(result).toContain("Bash(git:*)");
    expect(result).toContain("Read(file_path:/Users/user/**)");
    expect(result).toContain("WebFetch(domain:github.com)");
  });

  test("handles chain subsumptions (A→B→C, keeps only A)", () => {
    const permissions = ["Bash(git:*)", "Bash(git log:*)", "Bash(git log --oneline:*)"];

    const result = removeSubsumed(permissions, "allow");

    expect(result).toHaveLength(1);
    expect(result).toContain("Bash(git:*)");
  });
});
