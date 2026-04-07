/**
 * Example-Based Tests for Permission Merging and Conflict Resolution
 *
 * Tests specific, known cases to verify merging logic works correctly.
 * Complements property-based tests with concrete examples.
 */

import { mergePermissions, resolveConflicts } from "@/lib/claude/permissions/merger.js";
import type { Permissions } from "@/lib/claude/permissions/types.js";
import { describe, expect, test } from "vitest";

// ============================================================================
// resolveConflicts() - Exact Match Conflicts
// ============================================================================

describe("resolveConflicts - Exact Match", () => {
  test("exact match in both allow and deny - removed from allow, kept in deny", () => {
    const permissions: Permissions = {
      allow: ["Bash(git:*)", "Bash(npm:*)"],
      deny: ["Bash(git:*)"],
    };

    const result = resolveConflicts(permissions);

    expect(result.resolved.allow).toHaveLength(1);
    expect(result.resolved.allow).toContain("Bash(npm:*)");
    expect(result.resolved.allow).not.toContain("Bash(git:*)");

    expect(result.resolved.deny).toHaveLength(1);
    expect(result.resolved.deny).toContain("Bash(git:*)");

    expect(result.conflictCount).toBe(1);
  });

  test("multiple exact matches", () => {
    const permissions: Permissions = {
      allow: ["Bash(git:*)", "Bash(npm:*)", "Read(file_path:/tmp/**)"],
      deny: ["Bash(git:*)", "Bash(npm:*)"],
    };

    const result = resolveConflicts(permissions);

    expect(result.resolved.allow).toHaveLength(1);
    expect(result.resolved.allow).toContain("Read(file_path:/tmp/**)");

    expect(result.resolved.deny).toHaveLength(2);
    expect(result.resolved.deny).toContain("Bash(git:*)");
    expect(result.resolved.deny).toContain("Bash(npm:*)");

    expect(result.conflictCount).toBe(2);
  });
});

// ============================================================================
// resolveConflicts() - Subsumption Conflicts
// ============================================================================

describe("resolveConflicts - Subsumption", () => {
  test("Bash(git:*) in deny + Bash(git log:*) in allow - remove from allow (subsumed)", () => {
    const permissions: Permissions = {
      allow: ["Bash(git log:*)", "Bash(npm:*)"],
      deny: ["Bash(git:*)"],
    };

    const result = resolveConflicts(permissions);

    expect(result.resolved.allow).toHaveLength(1);
    expect(result.resolved.allow).toContain("Bash(npm:*)");
    expect(result.resolved.allow).not.toContain("Bash(git log:*)");

    expect(result.resolved.deny).toHaveLength(1);
    expect(result.resolved.deny).toContain("Bash(git:*)");

    expect(result.conflictCount).toBe(1);
    expect(result.subsumed).toContain("Bash(git log:*)");
  });

  test("multiple allow permissions subsumed by single deny", () => {
    const permissions: Permissions = {
      allow: ["Bash(git log:*)", "Bash(git worktree:*)", "Bash(npm:*)"],
      deny: ["Bash(git:*)"],
    };

    const result = resolveConflicts(permissions);

    expect(result.resolved.allow).toHaveLength(1);
    expect(result.resolved.allow).toContain("Bash(npm:*)");

    expect(result.resolved.deny).toHaveLength(1);
    expect(result.resolved.deny).toContain("Bash(git:*)");

    expect(result.conflictCount).toBe(2);
    expect(result.subsumed).toHaveLength(2);
    expect(result.subsumed).toContain("Bash(git log:*)");
    expect(result.subsumed).toContain("Bash(git worktree:*)");
  });

  test("path subsumption in conflicts", () => {
    const permissions: Permissions = {
      allow: ["Read(file_path:/Users/shz/Code/project-a/**)", "Read(file_path:/Users/other/**)"],
      deny: ["Read(file_path:/Users/shz/Code/**)"],
    };

    const result = resolveConflicts(permissions);

    expect(result.resolved.allow).toHaveLength(1);
    expect(result.resolved.allow).toContain("Read(file_path:/Users/other/**)");

    expect(result.resolved.deny).toHaveLength(1);
    expect(result.resolved.deny).toContain("Read(file_path:/Users/shz/Code/**)");

    expect(result.conflictCount).toBe(1);
    expect(result.subsumed).toContain("Read(file_path:/Users/shz/Code/project-a/**)");
  });

  test("narrower deny does NOT subsume broader allow", () => {
    const permissions: Permissions = {
      allow: ["Bash(git:*)"],
      deny: ["Bash(git log:*)"],
    };

    const result = resolveConflicts(permissions);

    // Both should remain (no subsumption, narrower doesn't subsume broader)
    expect(result.resolved.allow).toHaveLength(1);
    expect(result.resolved.allow).toContain("Bash(git:*)");

    expect(result.resolved.deny).toHaveLength(1);
    expect(result.resolved.deny).toContain("Bash(git log:*)");

    expect(result.conflictCount).toBe(0);
  });
});

// ============================================================================
// resolveConflicts() - No Conflicts
// ============================================================================

describe("resolveConflicts - No Conflicts", () => {
  test("no overlap - both lists unchanged", () => {
    const permissions: Permissions = {
      allow: ["Bash(git:*)", "Bash(npm:*)"],
      deny: ["Bash(rm:*)"],
    };

    const result = resolveConflicts(permissions);

    expect(result.resolved.allow).toHaveLength(2);
    expect(result.resolved.allow).toContain("Bash(git:*)");
    expect(result.resolved.allow).toContain("Bash(npm:*)");

    expect(result.resolved.deny).toHaveLength(1);
    expect(result.resolved.deny).toContain("Bash(rm:*)");

    expect(result.conflictCount).toBe(0);
  });

  test("different types - no conflicts", () => {
    const permissions: Permissions = {
      allow: ["Bash(git:*)"],
      deny: ["Read(file_path:/tmp/**)"],
    };

    const result = resolveConflicts(permissions);

    expect(result.resolved.allow).toHaveLength(1);
    expect(result.resolved.allow).toContain("Bash(git:*)");

    expect(result.resolved.deny).toHaveLength(1);
    expect(result.resolved.deny).toContain("Read(file_path:/tmp/**)");

    expect(result.conflictCount).toBe(0);
  });
});

// ============================================================================
// resolveConflicts() - Edge Cases
// ============================================================================

describe("resolveConflicts - Edge Cases", () => {
  test("empty lists", () => {
    const permissions: Permissions = {
      allow: [],
      deny: [],
    };

    const result = resolveConflicts(permissions);

    expect(result.resolved.allow).toHaveLength(0);
    expect(result.resolved.deny).toHaveLength(0);
    expect(result.conflictCount).toBe(0);
  });

  test("only allow permissions", () => {
    const permissions: Permissions = {
      allow: ["Bash(git:*)", "Bash(npm:*)"],
      deny: [],
    };

    const result = resolveConflicts(permissions);

    expect(result.resolved.allow).toHaveLength(2);
    expect(result.resolved.deny).toHaveLength(0);
    expect(result.conflictCount).toBe(0);
  });

  test("only deny permissions", () => {
    const permissions: Permissions = {
      allow: [],
      deny: ["Bash(rm:*)"],
    };

    const result = resolveConflicts(permissions);

    expect(result.resolved.allow).toHaveLength(0);
    expect(result.resolved.deny).toHaveLength(1);
    expect(result.conflictCount).toBe(0);
  });

  test("ask permissions are unaffected by conflict resolution", () => {
    const permissions: Permissions = {
      allow: ["Bash(git:*)"],
      deny: ["Bash(git:*)"],
      ask: ["Bash(npm:*)"],
    };

    const result = resolveConflicts(permissions);

    // Ask should be unchanged
    expect(result.resolved.ask).toHaveLength(1);
    expect(result.resolved.ask).toContain("Bash(npm:*)");
  });

  test("malformed permissions are skipped gracefully", () => {
    const permissions: Permissions = {
      allow: ["Bash(git:*)", "InvalidFormat"],
      deny: ["Bash(git:*)"],
    };

    const result = resolveConflicts(permissions);

    // Should handle conflict for valid permission, keep malformed as-is
    expect(result.resolved.allow).toContain("InvalidFormat");
    expect(result.resolved.allow).not.toContain("Bash(git:*)");

    expect(result.conflictCount).toBe(1);
  });
});

// ============================================================================
// mergePermissions() - Full Pipeline
// ============================================================================

describe("mergePermissions - Full Pipeline", () => {
  test("merges global and local permissions with subsumption", () => {
    const global: Permissions = {
      allow: ["Bash(ls:*)"],
    };

    const local: Permissions[] = [
      { allow: ["Bash(git:*)", "Bash(git log:*)"] },
      { allow: ["Bash(npm:*)"] },
    ];

    const { merged, result } = mergePermissions(global, local);

    // Should have: ls, git, npm (git log subsumed)
    expect(merged.allow).toHaveLength(3);
    expect(merged.allow).toContain("Bash(git:*)");
    expect(merged.allow).toContain("Bash(ls:*)");
    expect(merged.allow).toContain("Bash(npm:*)");
    expect(merged.allow).not.toContain("Bash(git log:*)");

    expect(result.filesScanned).toBe(2);
    expect(result.filesProcessed).toBe(2);
    expect(result.filesSkipped).toBe(0);
    expect(result.subsumed).toContain("Bash(git log:*)");
    expect(result.conflictsResolved).toBe(0);

    // Added should only include git and npm (not ls, which was in global)
    expect(result.added.allow).toHaveLength(2);
    expect(result.added.allow).toContain("Bash(git:*)");
    expect(result.added.allow).toContain("Bash(npm:*)");
  });

  test("merges with conflicts", () => {
    const global: Permissions = {
      allow: ["Bash(ls:*)"],
      deny: [],
    };

    const local: Permissions[] = [{ allow: ["Bash(git:*)"] }, { deny: ["Bash(git:*)"] }];

    const { merged, result } = mergePermissions(global, local);

    // git:* should be in deny only
    expect(merged.allow).toHaveLength(1);
    expect(merged.allow).toContain("Bash(ls:*)");
    expect(merged.allow).not.toContain("Bash(git:*)");

    expect(merged.deny).toHaveLength(1);
    expect(merged.deny).toContain("Bash(git:*)");

    expect(result.conflictsResolved).toBe(1);
  });

  test("handles empty local settings", () => {
    const global: Permissions = {
      allow: ["Bash(git:*)"],
    };

    const local: Permissions[] = [];

    const { merged, result } = mergePermissions(global, local);

    // Should just be global permissions
    expect(merged.allow).toHaveLength(1);
    expect(merged.allow).toContain("Bash(git:*)");

    expect(result.filesScanned).toBe(0);
    expect(result.filesProcessed).toBe(0);
    expect(result.added.allow).toHaveLength(0);
  });

  test("handles local settings with no permissions", () => {
    const global: Permissions = {
      allow: ["Bash(git:*)"],
    };

    const local: Permissions[] = [{ allow: [] }, { deny: [] }];

    const { merged, result } = mergePermissions(global, local);

    expect(merged.allow).toHaveLength(1);
    expect(merged.allow).toContain("Bash(git:*)");

    expect(result.filesScanned).toBe(2);
    expect(result.filesProcessed).toBe(0);
    expect(result.filesSkipped).toBe(2);
  });

  test("deduplicates across files", () => {
    const global: Permissions = {
      allow: [],
    };

    const local: Permissions[] = [
      { allow: ["Bash(git:*)"] },
      { allow: ["Bash(git:*)"] },
      { allow: ["Bash(git:*)"] },
    ];

    const { merged, result } = mergePermissions(global, local);

    // Should only have one instance
    expect(merged.allow).toHaveLength(1);
    expect(merged.allow).toContain("Bash(git:*)");

    expect(result.filesProcessed).toBe(3);
  });

  test("sorts permissions alphabetically", () => {
    const global: Permissions = {
      allow: [],
    };

    const local: Permissions[] = [{ allow: ["Bash(npm:*)", "Bash(git:*)", "Bash(docker:*)"] }];

    const { merged } = mergePermissions(global, local);

    // Should be sorted
    expect(merged.allow).toEqual(["Bash(docker:*)", "Bash(git:*)", "Bash(npm:*)"]);
  });

  test("handles all three categories (allow, deny, ask)", () => {
    const global: Permissions = {
      allow: ["Bash(ls:*)"],
      deny: ["Bash(rm:*)"],
      ask: [],
    };

    const local: Permissions[] = [
      {
        allow: ["Bash(git:*)"],
        deny: ["Bash(dd:*)"],
        ask: ["Bash(curl:*)"],
      },
    ];

    const { merged } = mergePermissions(global, local);

    expect(merged.allow).toContain("Bash(ls:*)");
    expect(merged.allow).toContain("Bash(git:*)");

    expect(merged.deny).toContain("Bash(rm:*)");
    expect(merged.deny).toContain("Bash(dd:*)");

    expect(merged.ask).toContain("Bash(curl:*)");
  });

  test("complex scenario: subsumption + conflicts + deduplication", () => {
    const global: Permissions = {
      allow: ["Bash(ls:*)"],
      deny: [],
    };

    const local: Permissions[] = [
      {
        // File 1: git commands
        allow: ["Bash(git:*)", "Bash(git log:*)", "Bash(git worktree:*)"],
      },
      {
        // File 2: npm commands + duplicate git
        allow: ["Bash(npm:*)", "Bash(git:*)"],
      },
      {
        // File 3: deny git (creates conflict)
        deny: ["Bash(git:*)"],
      },
    ];

    const { merged, result } = mergePermissions(global, local);

    // Allow should have: ls, npm (git and subcommands removed by conflict)
    expect(merged.allow).toHaveLength(2);
    expect(merged.allow).toContain("Bash(ls:*)");
    expect(merged.allow).toContain("Bash(npm:*)");

    // Deny should have: git
    expect(merged.deny).toHaveLength(1);
    expect(merged.deny).toContain("Bash(git:*)");

    // git:* should be in conflicts (exact match)
    // git log:* and git worktree:* should be in subsumed (subsumed by deny)
    expect(result.conflictsResolved).toBeGreaterThan(0);
    expect(result.subsumed.length).toBeGreaterThan(0);
  });
});
