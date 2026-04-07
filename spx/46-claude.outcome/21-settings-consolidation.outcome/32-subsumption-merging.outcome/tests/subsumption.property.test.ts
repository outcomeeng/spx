/**
 * Property-Based Tests for Subsumption Algorithm
 *
 * These tests verify algebraic properties that MUST hold for ALL inputs,
 * not just specific examples. Uses fast-check to generate random inputs.
 *
 * Properties verified:
 * 1. Irreflexivity: A permission doesn't subsume itself
 * 2. Transitivity: If A→B and B→C, then A→C
 * 3. Anti-symmetry: If A→B, then B cannot →A
 * 4. Type consistency: Different types never subsume
 * 5. Idempotency: removeSubsumed is idempotent
 */

import { parsePermission } from "@/lib/claude/permissions/parser.js";
import { removeSubsumed, subsumes } from "@/lib/claude/permissions/subsumption.js";
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
 * Generate random command scope patterns
 * Examples: "git:*", "npm:*", "docker:*"
 */
const arbCommandScope = fc
  .string({ minLength: 1, maxLength: 20 })
  .filter((s) => !s.includes("(") && !s.includes(")") && !s.includes(":"))
  .map((s) => (s || "cmd") + ":*");

/**
 * Generate random path scope patterns
 * Examples: "file_path:/Users/code/**", "directory_path:/tmp/**"
 */
const arbPathScope = fc
  .string({ minLength: 5, maxLength: 50 })
  .filter((s) => !s.includes("(") && !s.includes(")"))
  .map((s) => `file_path:${s || "/path"}`);

/**
 * Generate random permission strings
 */
const arbPermissionString = fc
  .tuple(arbPermissionType, arbCommandScope)
  .map(([type, scope]) => `${type}(${scope})`);

// ============================================================================
// Property 1: Irreflexivity
// ============================================================================

describe("subsumes - Property: Irreflexivity", () => {
  test("A permission doesn't subsume itself", () => {
    fc.assert(
      fc.property(arbPermissionType, arbCommandScope, (type, scope) => {
        const perm = parsePermission(`${type}(${scope})`, "allow");
        return subsumes(perm, perm) === false;
      }),
      { numRuns: 100 },
    );
  });

  test("A permission with path scope doesn't subsume itself", () => {
    fc.assert(
      fc.property(arbPermissionType, arbPathScope, (type, scope) => {
        const perm = parsePermission(`${type}(${scope})`, "allow");
        return subsumes(perm, perm) === false;
      }),
      { numRuns: 100 },
    );
  });
});

// ============================================================================
// Property 2: Transitivity
// ============================================================================

describe("subsumes - Property: Transitivity", () => {
  test("If A→B and B→C, then A→C (command patterns)", () => {
    fc.assert(
      fc.property(arbPermissionType, fc.string({ minLength: 1, maxLength: 10 }), (type, base) => {
        // Generate nested scopes: "git:*", "git log:*", "git log --oneline:*"
        const scopeA = `${base}:*`;
        const scopeB = `${base} sub:*`;
        const scopeC = `${base} sub subsub:*`;

        try {
          const permA = parsePermission(`${type}(${scopeA})`, "allow");
          const permB = parsePermission(`${type}(${scopeB})`, "allow");
          const permC = parsePermission(`${type}(${scopeC})`, "allow");

          const aSubsumesB = subsumes(permA, permB);
          const bSubsumesC = subsumes(permB, permC);
          const aSubsumesC = subsumes(permA, permC);

          // If A→B and B→C, then A→C must hold
          // Using implication: !(p && q) || r is equivalent to (p && q) => r
          return !aSubsumesB || !bSubsumesC || aSubsumesC;
        } catch {
          // Skip malformed permissions
          return true;
        }
      }),
      { numRuns: 100 },
    );
  });

  test("If A→B and B→C, then A→C (path patterns)", () => {
    fc.assert(
      fc.property(arbPermissionType, fc.string({ minLength: 1, maxLength: 20 }), (type, base) => {
        // Generate nested paths: "/code/**", "/code/project/**", "/code/project/src/**"
        const scopeA = `file_path:/${base}/**`;
        const scopeB = `file_path:/${base}/project/**`;
        const scopeC = `file_path:/${base}/project/src/**`;

        try {
          const permA = parsePermission(`${type}(${scopeA})`, "allow");
          const permB = parsePermission(`${type}(${scopeB})`, "allow");
          const permC = parsePermission(`${type}(${scopeC})`, "allow");

          const aSubsumesB = subsumes(permA, permB);
          const bSubsumesC = subsumes(permB, permC);
          const aSubsumesC = subsumes(permA, permC);

          // If A→B and B→C, then A→C must hold
          return !aSubsumesB || !bSubsumesC || aSubsumesC;
        } catch {
          // Skip malformed permissions
          return true;
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ============================================================================
// Property 3: Anti-symmetry
// ============================================================================

describe("subsumes - Property: Anti-symmetry", () => {
  test("If A subsumes B, then B cannot subsume A", () => {
    fc.assert(
      fc.property(arbPermissionType, arbCommandScope, arbCommandScope, (type, scopeA, scopeB) => {
        try {
          const permA = parsePermission(`${type}(${scopeA})`, "allow");
          const permB = parsePermission(`${type}(${scopeB})`, "allow");

          const aSubsumesB = subsumes(permA, permB);
          const bSubsumesA = subsumes(permB, permA);

          // Both cannot be true simultaneously
          return !(aSubsumesB && bSubsumesA);
        } catch {
          // Skip malformed permissions
          return true;
        }
      }),
      { numRuns: 100 },
    );
  });

  test("If A subsumes B with paths, then B cannot subsume A", () => {
    fc.assert(
      fc.property(arbPermissionType, arbPathScope, arbPathScope, (type, scopeA, scopeB) => {
        try {
          const permA = parsePermission(`${type}(${scopeA})`, "allow");
          const permB = parsePermission(`${type}(${scopeB})`, "allow");

          const aSubsumesB = subsumes(permA, permB);
          const bSubsumesA = subsumes(permB, permA);

          // Both cannot be true simultaneously
          return !(aSubsumesB && bSubsumesA);
        } catch {
          // Skip malformed permissions
          return true;
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ============================================================================
// Property 4: Type Consistency
// ============================================================================

describe("subsumes - Property: Type Consistency", () => {
  test("Different types never subsume each other", () => {
    fc.assert(
      fc.property(arbPermissionType, arbPermissionType, arbCommandScope, (typeA, typeB, scope) => {
        fc.pre(typeA !== typeB); // Precondition: different types

        try {
          const permA = parsePermission(`${typeA}(${scope})`, "allow");
          const permB = parsePermission(`${typeB}(${scope})`, "allow");

          return subsumes(permA, permB) === false && subsumes(permB, permA) === false;
        } catch {
          // Skip malformed permissions
          return true;
        }
      }),
      { numRuns: 100 },
    );
  });

  test("Different types never subsume with path patterns", () => {
    fc.assert(
      fc.property(arbPermissionType, arbPermissionType, arbPathScope, (typeA, typeB, scope) => {
        fc.pre(typeA !== typeB); // Precondition: different types

        try {
          const permA = parsePermission(`${typeA}(${scope})`, "allow");
          const permB = parsePermission(`${typeB}(${scope})`, "allow");

          return subsumes(permA, permB) === false && subsumes(permB, permA) === false;
        } catch {
          // Skip malformed permissions
          return true;
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ============================================================================
// Property 5: Idempotency
// ============================================================================

describe("removeSubsumed - Property: Idempotency", () => {
  test("Applying removeSubsumed twice produces same result as once", () => {
    fc.assert(
      fc.property(fc.array(arbPermissionString, { maxLength: 20 }), (permissions) => {
        const once = removeSubsumed(permissions, "allow");
        const twice = removeSubsumed(once, "allow");

        // Sort for comparison (order doesn't matter)
        return JSON.stringify([...once].sort()) === JSON.stringify([...twice].sort());
      }),
      { numRuns: 100 },
    );
  });

  test("Empty array remains empty", () => {
    fc.assert(
      fc.property(fc.constant([] as string[]), (permissions) => {
        const result = removeSubsumed(permissions, "allow");
        return result.length === 0;
      }),
      { numRuns: 10 },
    );
  });

  test("Single permission remains unchanged", () => {
    fc.assert(
      fc.property(arbPermissionString, (perm) => {
        const result = removeSubsumed([perm], "allow");
        return result.length === 1 && result[0] === perm;
      }),
      { numRuns: 100 },
    );
  });
});

// ============================================================================
// Additional Property: Monotonicity
// ============================================================================

describe("removeSubsumed - Property: Monotonicity", () => {
  test("Result is never larger than input", () => {
    fc.assert(
      fc.property(fc.array(arbPermissionString, { maxLength: 30 }), (permissions) => {
        const result = removeSubsumed(permissions, "allow");
        return result.length <= permissions.length;
      }),
      { numRuns: 100 },
    );
  });

  test("Result contains only elements from input", () => {
    fc.assert(
      fc.property(fc.array(arbPermissionString, { maxLength: 20 }), (permissions) => {
        const result = removeSubsumed(permissions, "allow");
        const inputSet = new Set(permissions);

        // Every element in result must be in input
        return result.every((perm) => inputSet.has(perm));
      }),
      { numRuns: 100 },
    );
  });
});
