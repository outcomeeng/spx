# ADR 002: Security-First Conflict Resolution (Deny Wins)

## Problem

When consolidating permissions from multiple project-local settings files, the same permission may appear in both `allow` and `deny` lists, creating a conflict. The system must deterministically resolve these conflicts in a way that aligns with security best practices.

## Context

- **Business**: Users need predictable, secure conflict resolution; unexpected permission grants create security risks
- **Technical**: Claude Code evaluates `deny` before `allow`; conflicts indicate user uncertainty or evolving security posture

## Decision

**When a permission appears in both `allow` and `deny`, keep it in `deny` only and remove from `allow`. Additionally, apply subsumption: if `deny` contains a broader permission, remove subsumed permissions from `allow`.**

## Rationale

Three alternatives were considered:

1. **Allow wins** — Rejected because it's less secure; a single permissive project could override restrictive global policy
2. **Interactive resolution** — Rejected because it violates automation goal; requires manual user intervention
3. **Deny wins with subsumption** — Chosen because:
   - Aligns with "secure by default" principle
   - Matches Claude Code's evaluation order (deny checked first)
   - Predictable: stricter policy always wins
   - Extensible: subsumption applies to conflicts too

Conflict resolution algorithm:

**Exact match conflict**:

```typescript
if (allowSet.has(perm) && denySet.has(perm)) {
  // Keep in deny, remove from allow
  allowSet.delete(perm);
  conflictCount++;
}
```

**Subsumption conflict**:

```typescript
// If deny has "Bash(git:*)" and allow has "Bash(git log:*)"
for (const denyPerm of denyPermissions) {
  for (const allowPerm of allowPermissions) {
    if (subsumes(denyPerm, allowPerm)) {
      // Broader deny subsumes narrower allow
      allowSet.delete(allowPerm);
      subsumedByDeny.push(allowPerm);
    }
  }
}
```

## Trade-offs Accepted

- **Less flexibility**: User cannot override deny with allow in local settings. Mitigation: Document that deny is authoritative; users must edit global settings to loosen restrictions.
- **Possible over-restriction**: If user has `Bash(git:*)` in deny but wants `Bash(git status:*)` in allow, the allow is removed. Mitigation: Provide clear reporting of conflict resolution in output; user can manually adjust.

## Testing Strategy

### Level Coverage

| Level           | Question Answered                               | Scope                             |
| --------------- | ----------------------------------------------- | --------------------------------- |
| 1 (Unit)        | Does conflict resolution correctly prefer deny? | `resolveConflicts()`              |
| 1 (Property)    | Are conflict resolution properties preserved?   | Consistency, determinism          |
| 2 (Integration) | Does full pipeline resolve conflicts correctly? | End-to-end with conflicting files |

### Escalation Rationale

- **1 → Property**: Example-based tests verify known conflicts, but property tests verify consistency for all inputs
- **Property → 2**: Property tests verify algorithm correctness, but integration tests verify real file scenarios

### Test Harness

| Level | Harness             | Location/Dependency      |
| ----- | ------------------- | ------------------------ |
| 1     | Vitest + fast-check | `npm install fast-check` |
| 2     | Temp directories    | `fs.promises.mkdtemp()`  |

### Behaviors Verified

**Level 1 (Example-Based Unit):**

- Exact match in both allow and deny → removed from allow, kept in deny
- `Bash(git:*)` in deny + `Bash(git log:*)` in allow → remove from allow (subsumed)
- No conflict → both lists unchanged
- Multiple conflicts → all resolved correctly, count incremented
- Empty lists → no errors

**Level 1 (Property-Based with fast-check):**

```typescript
import fc from "fast-check";

// Arbitrary generators
const arbPermission = fc
  .tuple(fc.constantFrom("Bash", "Read", "WebFetch"), fc.string({ minLength: 1, maxLength: 20 }))
  .map(([type, scope]) => `${type}(${scope}:*)`);

const arbPermissions = fc.record({
  allow: fc.array(arbPermission, { maxLength: 50 }),
  deny: fc.array(arbPermission, { maxLength: 20 }),
});

// Property 1: Conflict resolution is deterministic
fc.assert(
  fc.property(arbPermissions, (permissions) => {
    const result1 = resolveConflicts(permissions);
    const result2 = resolveConflicts(permissions);

    return (
      JSON.stringify(result1.resolved.allow.sort())
        === JSON.stringify(result2.resolved.allow.sort())
      && JSON.stringify(result1.resolved.deny.sort()) === JSON.stringify(result2.resolved.deny.sort())
    );
  }),
);

// Property 2: Deny list never shrinks
fc.assert(
  fc.property(arbPermissions, (permissions) => {
    const result = resolveConflicts(permissions);

    // Every deny permission must be in output
    return permissions.deny.every((perm) => result.resolved.deny.includes(perm));
  }),
);

// Property 3: No permission appears in both allow and deny after resolution
fc.assert(
  fc.property(arbPermissions, (permissions) => {
    const result = resolveConflicts(permissions);

    const allowSet = new Set(result.resolved.allow);
    const denySet = new Set(result.resolved.deny);

    // No overlap
    return result.resolved.allow.every((perm) => !denySet.has(perm));
  }),
);

// Property 4: Conflict count matches actual conflicts
fc.assert(
  fc.property(arbPermissions, (permissions) => {
    const result = resolveConflicts(permissions);

    const allowSet = new Set(permissions.allow);
    const denySet = new Set(permissions.deny);

    // Count exact matches
    const exactMatches = permissions.deny.filter((perm) => allowSet.has(perm)).length;

    // Conflict count should be at least exact matches
    return result.conflictCount >= exactMatches;
  }),
);

// Property 5: Resolution is idempotent
fc.assert(
  fc.property(arbPermissions, (permissions) => {
    const once = resolveConflicts(permissions);
    const twice = resolveConflicts(once.resolved);

    return (
      JSON.stringify(once.resolved.allow.sort()) === JSON.stringify(twice.resolved.allow.sort())
      && JSON.stringify(once.resolved.deny.sort()) === JSON.stringify(twice.resolved.deny.sort())
      && twice.conflictCount === 0 // No conflicts after first resolution
    );
  }),
);
```

**Level 2 (Integration):**

- Create temp settings files:
  - File A: `allow: ["Bash(git:*)"]`
  - File B: `deny: ["Bash(git:*)"]`
  - File C: `allow: ["Bash(git log:*)"]`
- Run full consolidation
- Verify:
  - `Bash(git:*)` only in deny
  - `Bash(git log:*)` removed (subsumed by deny)
  - Report shows conflicts resolved
  - Backup created before changes

## Validation

### How to Recognize Compliance

You're following this decision if:

- Conflicting permissions always resolved to deny
- Subsumption applies to conflicts (deny subsumes allow)
- Conflict resolution is deterministic (same input → same output)
- Reporting shows which permissions were removed due to conflicts

### MUST

- Remove exact match from allow when present in deny
- Apply subsumption to conflicts (broader deny removes narrower allow)
- Report conflict count and list subsumed permissions
- Ensure resolution is deterministic and idempotent
- Pass all property-based tests proving consistency

### NEVER

- Allow a permission to appear in both allow and deny after resolution
- Prefer allow over deny in any conflict scenario
- Silently remove permissions without reporting
- Make conflict resolution non-deterministic
