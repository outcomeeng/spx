/**
 * Property-Based Tests for Conflict Resolution Algorithm
 *
 * These tests verify algebraic properties that MUST hold for ALL inputs,
 * not just specific examples. Uses fast-check to generate random inputs.
 *
 * Properties verified:
 * 1. Determinism: Same input produces same output
 * 2. Deny preservation: Deny list never shrinks
 * 3. No overlap: No permission in both allow and deny after resolution
 * 4. Accurate counting: Conflict count matches actual conflicts
 * 5. Idempotency: Resolution is idempotent
 */

import { resolveConflicts } from "@/lib/claude/permissions/merger.js";
import fc from "fast-check";
import { describe, test } from "vitest";

// ============================================================================
// Arbitrary Generators (for fast-check)
// ============================================================================

/**
 * Generate random permission types
 */
const arbPermissionType = fc.constantFrom("Bash", "Read", "WebFetch", "Write", "Edit");

/**
 * Generate random permission scope
 */
const arbScope = fc
  .string({ minLength: 1, maxLength: 20 })
  .filter((s) => !s.includes("(") && !s.includes(")"))
  .map((s) => (s || "scope") + ":*");

/**
 * Generate random permission string
 */
const arbPermission = fc
  .tuple(arbPermissionType, arbScope)
  .map(([type, scope]) => `${type}(${scope})`);

/**
 * Generate random Permissions object
 */
const arbPermissions = fc.record({
  allow: fc.array(arbPermission, { maxLength: 50 }),
  deny: fc.array(arbPermission, { maxLength: 20 }),
  ask: fc.array(arbPermission, { maxLength: 10 }),
});

// ============================================================================
// Property 1: Determinism
// ============================================================================

describe("resolveConflicts - Property: Determinism", () => {
  test("Same input produces same output every time", () => {
    fc.assert(
      fc.property(arbPermissions, (permissions) => {
        const result1 = resolveConflicts(permissions);
        const result2 = resolveConflicts(permissions);

        // Allow lists must be identical
        const allow1Sorted = JSON.stringify((result1.resolved.allow || []).sort());
        const allow2Sorted = JSON.stringify((result2.resolved.allow || []).sort());

        // Deny lists must be identical
        const deny1Sorted = JSON.stringify((result1.resolved.deny || []).sort());
        const deny2Sorted = JSON.stringify((result2.resolved.deny || []).sort());

        // Ask lists must be identical
        const ask1Sorted = JSON.stringify((result1.resolved.ask || []).sort());
        const ask2Sorted = JSON.stringify((result2.resolved.ask || []).sort());

        // Conflict counts must be identical
        const countsMatch = result1.conflictCount === result2.conflictCount;

        // Subsumed lists must be identical (order may vary)
        const subsumed1Sorted = JSON.stringify([...result1.subsumed].sort());
        const subsumed2Sorted = JSON.stringify([...result2.subsumed].sort());

        return (
          allow1Sorted === allow2Sorted
          && deny1Sorted === deny2Sorted
          && ask1Sorted === ask2Sorted
          && countsMatch
          && subsumed1Sorted === subsumed2Sorted
        );
      }),
      { numRuns: 100 },
    );
  });
});

// ============================================================================
// Property 2: Deny Preservation
// ============================================================================

describe("resolveConflicts - Property: Deny Preservation", () => {
  test("Deny list never shrinks - every deny permission remains", () => {
    fc.assert(
      fc.property(arbPermissions, (permissions) => {
        const result = resolveConflicts(permissions);

        const originalDeny = new Set(permissions.deny || []);
        const resolvedDeny = new Set(result.resolved.deny || []);

        // Every original deny permission must be in result
        for (const perm of originalDeny) {
          if (!resolvedDeny.has(perm)) {
            return false;
          }
        }

        return true;
      }),
      { numRuns: 100 },
    );
  });

  test("Deny list size never decreases", () => {
    fc.assert(
      fc.property(arbPermissions, (permissions) => {
        const result = resolveConflicts(permissions);

        const originalDenyLength = (permissions.deny || []).length;
        const resolvedDenyLength = (result.resolved.deny || []).length;

        return resolvedDenyLength >= originalDenyLength;
      }),
      { numRuns: 100 },
    );
  });
});

// ============================================================================
// Property 3: No Overlap
// ============================================================================

describe("resolveConflicts - Property: No Overlap", () => {
  test("No permission appears in both allow and deny after resolution", () => {
    fc.assert(
      fc.property(arbPermissions, (permissions) => {
        const result = resolveConflicts(permissions);

        const allowSet = new Set(result.resolved.allow || []);
        const denySet = new Set(result.resolved.deny || []);

        // Check every allow permission is not in deny
        for (const perm of allowSet) {
          if (denySet.has(perm)) {
            return false;
          }
        }

        return true;
      }),
      { numRuns: 100 },
    );
  });

  test("Intersection of allow and deny is empty", () => {
    fc.assert(
      fc.property(arbPermissions, (permissions) => {
        const result = resolveConflicts(permissions);

        const allow = result.resolved.allow || [];
        const deny = result.resolved.deny || [];

        // Find intersection
        const allowSet = new Set(allow);
        const intersection = deny.filter((p) => allowSet.has(p));

        return intersection.length === 0;
      }),
      { numRuns: 100 },
    );
  });
});

// ============================================================================
// Property 4: Accurate Counting
// ============================================================================

describe("resolveConflicts - Property: Accurate Counting", () => {
  test("Conflict count is at least number of exact matches", () => {
    fc.assert(
      fc.property(arbPermissions, (permissions) => {
        const result = resolveConflicts(permissions);

        const allowSet = new Set(permissions.allow || []);
        const denySet = new Set(permissions.deny || []);

        // Count exact matches
        const exactMatches = Array.from(allowSet).filter((perm) => denySet.has(perm)).length;

        // Conflict count should be at least exact matches
        // (may be higher due to subsumption conflicts)
        return result.conflictCount >= exactMatches;
      }),
      { numRuns: 100 },
    );
  });

  test("Conflict count matches number of permissions removed from allow", () => {
    fc.assert(
      fc.property(arbPermissions, (permissions) => {
        const result = resolveConflicts(permissions);

        const originalAllowSet = new Set(permissions.allow || []);
        const resolvedAllowSet = new Set(result.resolved.allow || []);

        // Count how many permissions were removed
        const removed = Array.from(originalAllowSet).filter(
          (perm) => !resolvedAllowSet.has(perm),
        ).length;

        // Conflict count should match number removed
        return result.conflictCount === removed;
      }),
      { numRuns: 100 },
    );
  });
});

// ============================================================================
// Property 5: Idempotency
// ============================================================================

describe("resolveConflicts - Property: Idempotency", () => {
  test("Applying resolution twice produces same result as once", () => {
    fc.assert(
      fc.property(arbPermissions, (permissions) => {
        const once = resolveConflicts(permissions);
        const twice = resolveConflicts(once.resolved);

        // Allow lists must be identical
        const allow1 = JSON.stringify((once.resolved.allow || []).sort());
        const allow2 = JSON.stringify((twice.resolved.allow || []).sort());

        // Deny lists must be identical
        const deny1 = JSON.stringify((once.resolved.deny || []).sort());
        const deny2 = JSON.stringify((twice.resolved.deny || []).sort());

        // Second resolution should have 0 conflicts (already resolved)
        const noNewConflicts = twice.conflictCount === 0;

        return allow1 === allow2 && deny1 === deny2 && noNewConflicts;
      }),
      { numRuns: 100 },
    );
  });

  test("No further conflicts after first resolution", () => {
    fc.assert(
      fc.property(arbPermissions, (permissions) => {
        const once = resolveConflicts(permissions);

        // After resolution, there should be no overlap
        const allowSet = new Set(once.resolved.allow || []);
        const denySet = new Set(once.resolved.deny || []);

        const hasOverlap = Array.from(allowSet).some((perm) => denySet.has(perm));

        return !hasOverlap;
      }),
      { numRuns: 100 },
    );
  });
});

// ============================================================================
// Additional Property: Monotonicity
// ============================================================================

describe("resolveConflicts - Property: Monotonicity", () => {
  test("Allow list never grows - can only shrink or stay same", () => {
    fc.assert(
      fc.property(arbPermissions, (permissions) => {
        const result = resolveConflicts(permissions);

        const originalAllowLength = (permissions.allow || []).length;
        const resolvedAllowLength = (result.resolved.allow || []).length;

        return resolvedAllowLength <= originalAllowLength;
      }),
      { numRuns: 100 },
    );
  });

  test("Resolved allow only contains elements from original allow", () => {
    fc.assert(
      fc.property(arbPermissions, (permissions) => {
        const result = resolveConflicts(permissions);

        const originalAllowSet = new Set(permissions.allow || []);
        const resolvedAllow = result.resolved.allow || [];

        // Every resolved allow permission must be in original
        return resolvedAllow.every((perm) => originalAllowSet.has(perm));
      }),
      { numRuns: 100 },
    );
  });

  test("Ask list is unchanged (not affected by conflict resolution)", () => {
    fc.assert(
      fc.property(arbPermissions, (permissions) => {
        const result = resolveConflicts(permissions);

        const originalAsk = JSON.stringify((permissions.ask || []).sort());
        const resolvedAsk = JSON.stringify((result.resolved.ask || []).sort());

        return originalAsk === resolvedAsk;
      }),
      { numRuns: 100 },
    );
  });
});

// ============================================================================
// Property: Subsumption in Conflicts
// ============================================================================

describe("resolveConflicts - Property: Subsumption Handling", () => {
  test("All subsumed permissions are also in conflictCount", () => {
    fc.assert(
      fc.property(arbPermissions, (permissions) => {
        const result = resolveConflicts(permissions);

        // Subsumed count should be part of conflict count
        // (conflict count includes both exact matches and subsumptions)
        return result.subsumed.length <= result.conflictCount;
      }),
      { numRuns: 100 },
    );
  });

  test("Subsumed permissions are all from original allow", () => {
    fc.assert(
      fc.property(arbPermissions, (permissions) => {
        const result = resolveConflicts(permissions);

        const originalAllowSet = new Set(permissions.allow || []);

        // Every subsumed permission must have been in allow
        return result.subsumed.every((perm) => originalAllowSet.has(perm));
      }),
      { numRuns: 100 },
    );
  });

  test("Subsumed permissions are not in resolved allow", () => {
    fc.assert(
      fc.property(arbPermissions, (permissions) => {
        const result = resolveConflicts(permissions);

        const resolvedAllowSet = new Set(result.resolved.allow || []);

        // No subsumed permission should remain in allow
        return result.subsumed.every((perm) => !resolvedAllowSet.has(perm));
      }),
      { numRuns: 100 },
    );
  });
});
