/**
 * Example-Based Tests for Subsumption Algorithm
 *
 * Tests specific, known cases to verify subsumption logic works correctly.
 * Complements property-based tests with concrete examples.
 */

import { parsePermission } from "@/lib/claude/permissions/parser.js";
import {
  detectSubsumptions,
  parseScopePattern,
  removeSubsumed,
  subsumes,
} from "@/lib/claude/permissions/subsumption.js";
import { describe, expect, test } from "vitest";

// ============================================================================
// parseScopePattern() Tests
// ============================================================================

describe("parseScopePattern", () => {
  test("detects command patterns", () => {
    const result = parseScopePattern("git:*");
    expect(result.type).toBe("command");
    expect(result.pattern).toBe("git:*");
  });

  test("detects file_path patterns", () => {
    const result = parseScopePattern("file_path:/Users/shz/Code/**");
    expect(result.type).toBe("path");
    expect(result.pattern).toBe("/Users/shz/Code/**");
  });

  test("detects directory_path patterns", () => {
    const result = parseScopePattern("directory_path:/tmp/**");
    expect(result.type).toBe("path");
    expect(result.pattern).toBe("/tmp/**");
  });

  test("detects path: patterns", () => {
    const result = parseScopePattern("path:/var/log/**");
    expect(result.type).toBe("path");
    expect(result.pattern).toBe("/var/log/**");
  });

  test("defaults to command pattern for non-path scopes", () => {
    const result = parseScopePattern("domain:github.com");
    expect(result.type).toBe("command");
    expect(result.pattern).toBe("domain:github.com");
  });
});

// ============================================================================
// subsumes() - Command Patterns
// ============================================================================

describe("subsumes - Command Patterns", () => {
  test("Bash(git:*) subsumes Bash(git log:*)", () => {
    const broader = parsePermission("Bash(git:*)", "allow");
    const narrower = parsePermission("Bash(git log:*)", "allow");

    expect(subsumes(broader, narrower)).toBe(true);
  });

  test("Bash(git:*) subsumes Bash(git worktree:*)", () => {
    const broader = parsePermission("Bash(git:*)", "allow");
    const narrower = parsePermission("Bash(git worktree:*)", "allow");

    expect(subsumes(broader, narrower)).toBe(true);
  });

  test("Bash(npm:*) does NOT subsume Bash(git:*) (different prefixes)", () => {
    const permA = parsePermission("Bash(npm:*)", "allow");
    const permB = parsePermission("Bash(git:*)", "allow");

    expect(subsumes(permA, permB)).toBe(false);
    expect(subsumes(permB, permA)).toBe(false);
  });

  test("Bash(git:*) does NOT subsume Bash(git:*) (identical)", () => {
    const perm = parsePermission("Bash(git:*)", "allow");

    expect(subsumes(perm, perm)).toBe(false);
  });

  test("Bash(npm:*) subsumes Bash(npm install:*)", () => {
    const broader = parsePermission("Bash(npm:*)", "allow");
    const narrower = parsePermission("Bash(npm install:*)", "allow");

    expect(subsumes(broader, narrower)).toBe(true);
  });

  test("Command without :* suffix", () => {
    const broader = parsePermission("Bash(ls)", "allow");
    const narrower = parsePermission("Bash(ls -la)", "allow");

    // "ls" should subsume "ls -la"
    expect(subsumes(broader, narrower)).toBe(true);
  });
});

// ============================================================================
// subsumes() - Path Patterns
// ============================================================================

describe("subsumes - Path Patterns", () => {
  test("Read(file_path:/Users/shz/Code/**) subsumes Read(file_path:/Users/shz/Code/project-a/**)", () => {
    const broader = parsePermission("Read(file_path:/Users/shz/Code/**)", "allow");
    const narrower = parsePermission("Read(file_path:/Users/shz/Code/project-a/**)", "allow");

    expect(subsumes(broader, narrower)).toBe(true);
  });

  test("Read(file_path:/Users/shz/**) subsumes Read(file_path:/Users/shz/Code/project-a/**)", () => {
    const broader = parsePermission("Read(file_path:/Users/shz/**)", "allow");
    const narrower = parsePermission("Read(file_path:/Users/shz/Code/project-a/**)", "allow");

    expect(subsumes(broader, narrower)).toBe(true);
  });

  test("Read(file_path:/Users/shz/Code/**) does NOT subsume Read(file_path:/Users/other/**)", () => {
    const permA = parsePermission("Read(file_path:/Users/shz/Code/**)", "allow");
    const permB = parsePermission("Read(file_path:/Users/other/**)", "allow");

    expect(subsumes(permA, permB)).toBe(false);
    expect(subsumes(permB, permA)).toBe(false);
  });

  test("Read(file_path:/tmp/**) does NOT subsume Read(file_path:/tmp/**) (identical)", () => {
    const perm = parsePermission("Read(file_path:/tmp/**)", "allow");

    expect(subsumes(perm, perm)).toBe(false);
  });

  test("Sibling paths do not subsume each other", () => {
    const permA = parsePermission("Read(file_path:/Users/shz/project-a/**)", "allow");
    const permB = parsePermission("Read(file_path:/Users/shz/project-b/**)", "allow");

    expect(subsumes(permA, permB)).toBe(false);
    expect(subsumes(permB, permA)).toBe(false);
  });
});

// ============================================================================
// subsumes() - Cross-Type (Must Not Subsume)
// ============================================================================

describe("subsumes - Cross-Type", () => {
  test("Bash does NOT subsume Read", () => {
    const bash = parsePermission("Bash(git:*)", "allow");
    const read = parsePermission("Read(file_path:/Users/shz/Code/**)", "allow");

    expect(subsumes(bash, read)).toBe(false);
    expect(subsumes(read, bash)).toBe(false);
  });

  test("Read does NOT subsume WebFetch", () => {
    const read = parsePermission("Read(file_path:/tmp/**)", "allow");
    const webFetch = parsePermission("WebFetch(domain:github.com)", "allow");

    expect(subsumes(read, webFetch)).toBe(false);
    expect(subsumes(webFetch, read)).toBe(false);
  });

  test("WebFetch does NOT subsume Bash", () => {
    const webFetch = parsePermission("WebFetch(domain:github.com)", "allow");
    const bash = parsePermission("Bash(curl:*)", "allow");

    expect(subsumes(webFetch, bash)).toBe(false);
    expect(subsumes(bash, webFetch)).toBe(false);
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
      parsePermission("Read(file_path:/Users/shz/Code/**)", "allow"),
      parsePermission("Read(file_path:/Users/shz/Code/project-a/**)", "allow"),
      parsePermission("Read(file_path:/Users/other/**)", "allow"),
    ];

    const results = detectSubsumptions(permissions);

    expect(results).toHaveLength(1);
    expect(results[0].broader.raw).toBe("Read(file_path:/Users/shz/Code/**)");
    expect(results[0].narrower).toHaveLength(1);
    expect(results[0].narrower[0].raw).toBe("Read(file_path:/Users/shz/Code/project-a/**)");
  });

  test("returns empty array when no subsumptions exist", () => {
    const permissions = [
      parsePermission("Bash(git:*)", "allow"),
      parsePermission("Bash(npm:*)", "allow"),
      parsePermission("Read(file_path:/tmp/**)", "allow"),
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
      "Read(file_path:/Users/shz/Code/**)",
      "Read(file_path:/Users/shz/Code/project-a/**)",
      "Read(file_path:/Users/shz/Code/project-b/**)",
      "Read(file_path:/Users/other/**)",
    ];

    const result = removeSubsumed(permissions, "allow");

    expect(result).toHaveLength(2);
    expect(result).toContain("Read(file_path:/Users/shz/Code/**)");
    expect(result).toContain("Read(file_path:/Users/other/**)");
    expect(result).not.toContain("Read(file_path:/Users/shz/Code/project-a/**)");
    expect(result).not.toContain("Read(file_path:/Users/shz/Code/project-b/**)");
  });

  test("returns all permissions when no subsumptions exist", () => {
    const permissions = ["Bash(git:*)", "Bash(npm:*)", "Read(file_path:/tmp/**)"];

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
    const permissions = ["Bash(npm:*)", "Bash(git:*)", "Read(file_path:/tmp/**)"];

    const result = removeSubsumed(permissions, "allow");

    // Order should be preserved
    expect(result).toEqual(permissions);
  });

  test("handles mixed command and path subsumptions", () => {
    const permissions = [
      "Bash(git:*)",
      "Bash(git log:*)",
      "Read(file_path:/Users/shz/**)",
      "Read(file_path:/Users/shz/Code/**)",
      "WebFetch(domain:github.com)",
    ];

    const result = removeSubsumed(permissions, "allow");

    expect(result).toHaveLength(3);
    expect(result).toContain("Bash(git:*)");
    expect(result).toContain("Read(file_path:/Users/shz/**)");
    expect(result).toContain("WebFetch(domain:github.com)");
  });

  test("handles chain subsumptions (A→B→C, keeps only A)", () => {
    const permissions = ["Bash(git:*)", "Bash(git log:*)", "Bash(git log --oneline:*)"];

    const result = removeSubsumed(permissions, "allow");

    expect(result).toHaveLength(1);
    expect(result).toContain("Bash(git:*)");
  });
});
