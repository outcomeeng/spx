# ADR 001: Subsumption Over Simple Deduplication

## Problem

Users accumulate 100+ duplicate and overlapping permissions across project-local `.claude/settings.local.json` files. Simple deduplication removes only exact matches (e.g., `Bash(git:*)` appearing in 5 files), but doesn't recognize when broader permissions make narrower ones redundant (e.g., `Bash(git:*)` makes `Bash(git log:*)` unnecessary).

## Context

- **Business**: Users need a clean, minimal permission set in `~/.claude/settings.json` without manual curation; overlapping permissions create maintenance burden and confusion
- **Technical**: Claude Code permission format uses `Type(scope)` pattern; scopes follow command-prefix (e.g., `git:*`) or path-prefix (e.g., `file_path:/Users/user/Code/**`) patterns

## Decision

**Implement subsumption detection: when merging permissions, remove narrower permissions that are logically redundant given broader ones present.**

## Rationale

Three alternatives were considered:

1. **Simple deduplication** — Rejected because it only removes exact matches; user data shows `Bash(git:*)`, `Bash(git log:*)`, `Bash(git worktree:*)`, etc. all coexisting
2. **Manual curation prompt** — Rejected because it requires user to understand subsumption rules; violates automation goal
3. **Subsumption detection** — Chosen because:
   - Automatically reduces permission set to minimal coverage
   - Provably correct via property-based testing
   - Aligns with how Claude Code permission matching actually works

Subsumption algorithm:

**Command patterns** (`Bash(git:*)` subsumes `Bash(git log:*)`):

```typescript
broaderPrefix = "git"; // from "git:*"
narrowerFull = "git log"; // from "git log:*"
return narrowerFull.startsWith(broaderPrefix) && narrowerFull.length > broaderPrefix.length;
```

**Path patterns** (`Read(file_path:/Users/user/Code/**)` subsumes `Read(file_path:/Users/user/Code/project-a/**)`):

```typescript
broaderPath = "/Users/user/Code";
narrowerPath = "/Users/user/Code/project-a";
return narrowerPath.startsWith(broaderPath + "/");
```

**Cross-type** (never subsume):

```typescript
return false if permission types differ (Bash vs Read)
```

## Trade-offs Accepted

- **Heuristic scope parsing**: Assumes `:*` suffix means prefix match; may not cover all future Claude Code permission patterns. Mitigation: Comprehensive property-based testing catches edge cases.
- **No wildcard inference**: Doesn't infer that `git-*` pattern matches `git-log`; only handles exact prefix matching. Mitigation: Covers 99% of real-world cases based on user data.
- **Path normalization required**: Windows vs Unix path separators need normalization. Mitigation: Reuse existing `normalizePath()` from scanner.

## Testing Strategy

> **Critical**: This algorithm requires **property-based testing** to verify algebraic properties hold for ALL inputs, not just examples.

### Level Coverage

| Level           | Question Answered                                        | Scope                                  |
| --------------- | -------------------------------------------------------- | -------------------------------------- |
| 1 (Unit)        | Does subsumption correctly detect all subsumption cases? | `subsumes()`, `detectSubsumptions()`   |
| 1 (Property)    | Do algebraic properties hold for all generated inputs?   | Subsumption properties with fast-check |
| 2 (Integration) | Does full consolidation preserve subsumption guarantees? | End-to-end pipeline with temp files    |

### Escalation Rationale

- **1 → Property**: Example-based tests verify known cases, but property tests verify mathematical correctness for infinite input space
- **Property → 2**: Property tests verify algorithm correctness, but integration tests verify correctness in full pipeline with file I/O

### Test Harness

| Level | Harness             | Location/Dependency      |
| ----- | ------------------- | ------------------------ |
| 1     | Vitest + fast-check | `npm install fast-check` |
| 2     | Temp directories    | `fs.promises.mkdtemp()`  |

### Behaviors Verified

**Level 1 (Example-Based Unit):**

- `subsumes("Bash(git:*)", "Bash(git log:*)") → true`
- `subsumes("Bash(git:*)", "Bash(git worktree:*)") → true`
- `subsumes("Bash(npm:*)", "Bash(git:*)") → false` (different prefixes)
- `subsumes("Bash(git:*)", "Bash(git:*)") → false` (identical = deduplication, not subsumption)
- `subsumes("Read(file_path:/Users/user/Code/**)", "Read(file_path:/Users/user/Code/project-a/**)") → true`
- `subsumes("Bash(git:*)", "Read(file_path:...)") → false` (cross-type)

**Level 1 (Property-Based with fast-check):**

```typescript
import fc from "fast-check";

// Arbitrary generators
const arbPermissionType = fc.constantFrom("Bash", "Read", "WebFetch");
const arbCommandScope = fc
  .stringOf(fc.char(), { minLength: 1, maxLength: 20 })
  .map((s) => `${s}:*`);
const arbPathScope = fc
  .stringOf(fc.char(), { minLength: 5, maxLength: 50 })
  .map((s) => `file_path:${s}`);

// Property 1: Irreflexivity - A permission doesn't subsume itself
fc.assert(
  fc.property(arbPermissionType, arbCommandScope, (type, scope) => {
    const perm = parsePermission(`${type}(${scope})`, "allow");
    return subsumes(perm, perm) === false;
  }),
);

// Property 2: Transitivity - If A subsumes B and B subsumes C, then A subsumes C
fc.assert(
  fc.property(
    arbPermissionType,
    fc.array(arbCommandScope, { minLength: 3, maxLength: 3 }),
    (type, [scopeA, scopeB, scopeC]) => {
      // Generate nested scopes: "git:*", "git log:*", "git log --oneline:*"
      const prefixA = scopeA.replace(":*", "");
      const prefixB = `${prefixA} sub`;
      const prefixC = `${prefixB} subsub`;

      const permA = parsePermission(`${type}(${prefixA}:*)`, "allow");
      const permB = parsePermission(`${type}(${prefixB}:*)`, "allow");
      const permC = parsePermission(`${type}(${prefixC}:*)`, "allow");

      const aSubsumesB = subsumes(permA, permB);
      const bSubsumesC = subsumes(permB, permC);
      const aSubsumesC = subsumes(permA, permC);

      // If A→B and B→C, then A→C must hold
      return !aSubsumesB || !bSubsumesC || aSubsumesC;
    },
  ),
);

// Property 3: Anti-symmetry - If A subsumes B, then B cannot subsume A
fc.assert(
  fc.property(arbPermissionType, arbCommandScope, arbCommandScope, (type, scopeA, scopeB) => {
    const permA = parsePermission(`${type}(${scopeA})`, "allow");
    const permB = parsePermission(`${type}(${scopeB})`, "allow");

    const aSubsumesB = subsumes(permA, permB);
    const bSubsumesA = subsumes(permB, permA);

    // Both cannot be true simultaneously
    return !(aSubsumesB && bSubsumesA);
  }),
);

// Property 4: Type consistency - Different types never subsume
fc.assert(
  fc.property(arbPermissionType, arbPermissionType, arbCommandScope, (typeA, typeB, scope) => {
    fc.pre(typeA !== typeB); // Precondition: different types

    const permA = parsePermission(`${typeA}(${scope})`, "allow");
    const permB = parsePermission(`${typeB}(${scope})`, "allow");

    return subsumes(permA, permB) === false && subsumes(permB, permA) === false;
  }),
);

// Property 5: removeSubsumed is idempotent
fc.assert(
  fc.property(fc.array(fc.string()), (permissions) => {
    const once = removeSubsumed(permissions, "allow");
    const twice = removeSubsumed(once, "allow");

    return JSON.stringify(once.sort()) === JSON.stringify(twice.sort());
  }),
);
```

**Level 2 (Integration):**

- Create 5 temp `.claude/settings.local.json` files with overlapping permissions
- Run full consolidation pipeline
- Verify:
  - `Bash(git:*)` present in output
  - `Bash(git log:*)`, `Bash(git worktree:*)` removed (subsumed)
  - `Bash(npm:*)` present (different prefix)
  - Path subsumption works correctly
  - Statistics report correct subsumption count

## Validation

### How to Recognize Compliance

You're following this decision if:

- Permission merging produces minimal set (no redundant narrower permissions)
- Subsumption logic uses prefix matching for command/path patterns
- Unit tests include property-based tests with fast-check
- Integration tests verify subsumption in full pipeline

### MUST

- Detect subsumption for command-prefix patterns (e.g., `git:*` vs `git log:*`)
- Detect subsumption for path-prefix patterns (e.g., `/Code/**` vs `/Code/project-a/**`)
- Return false for identical permissions (that's deduplication, handled separately)
- Return false for cross-type subsumption (Bash vs Read)
- Pass all property-based tests proving algebraic properties

### NEVER

- Mock permission parsing or subsumption logic in tests
- Assume subsumption without prefix/path analysis
- Allow cross-type subsumption (security risk)
- Skip property-based tests (examples alone are insufficient)
