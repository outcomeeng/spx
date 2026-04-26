# Story: Subsumption and Merging with Property-Based Tests

## Acceptance Criteria

- [ ] Subsumption algorithm correctly identifies when broader permissions subsume narrower ones (ADR-001)
- [ ] **Property-based tests verify all 5 algebraic properties from ADR-001**:
  - [ ] Irreflexivity: A permission doesn't subsume itself
  - [ ] Transitivity: If A→B and B→C, then A→C
  - [ ] Anti-symmetry: If A→B, then B cannot →A
  - [ ] Type consistency: Different types never subsume each other
  - [ ] Idempotency: `removeSubsumed()` produces same result when applied twice
- [ ] Conflict resolution correctly prefers deny over allow (ADR-002)
- [ ] **Property-based tests verify all 5 properties from ADR-002**:
  - [ ] Determinism: Same input always produces same output
  - [ ] Deny preservation: Deny list never shrinks during resolution
  - [ ] No overlap: No permission exists in both allow and deny after resolution
  - [ ] Accurate counting: Conflict count matches actual conflicts detected
  - [ ] Idempotency: Resolution produces same result when applied twice
- [ ] Deduplication removes exact duplicates using Sets
- [ ] Permission sorting maintained (alphabetical within each category)
- [ ] **All 10 property-based tests pass with fast-check** (5 from ADR-001 + 5 from ADR-002)
- [ ] No mocking used (pure functional approach, no external dependencies)
- [ ] Zero `any` types without justification

## Implementation Tasks

1. Implement subsumption algorithm in `src/lib/claude/permissions/subsumption.ts` per ADR-001:
   - Function: `subsumes(broader, narrower) => boolean`
   - Command patterns: `Bash(git:*)` subsumes `Bash(git log:*)`, `Bash(git worktree:*)`, etc.
   - Path patterns: `Read(file_path:/Users/user/Code/**)` subsumes `Read(file_path:/Users/user/Code/project-a/**)`
   - Type matching: `Bash(...)` never subsumes `Read(...)` (different types)
   - Function: `detectSubsumptions(permissions) => SubsumptionResult[]`
   - Function: `removeSubsumed(permissions) => string[]` (main entry point)

2. Implement conflict resolution in `src/lib/claude/permissions/merger.ts` per ADR-002:
   - Function: `resolveConflicts(allow, deny) => { allow, deny, conflicts }`
   - Exact match conflict: Remove from allow, keep in deny
   - Subsumption conflict: If deny subsumes allow, remove from allow
   - Track conflicts for reporting (permission string + source information)
   - Function: `mergePermissions(sources) => MergeResult`
   - Combine all permissions from all sources
   - Apply subsumption via `removeSubsumed()`
   - Resolve conflicts via `resolveConflicts()`
   - Deduplicate with Sets and sort alphabetically

3. **Write property-based tests with fast-check** (CRITICAL):
   - File: `tests/unit/subsumption.properties.test.ts`
   - Arbitrary generators for permissions:
     - `arbPermissionType`: `fc.constantFrom("Bash", "Read", "WebFetch")`
     - `arbCommandScope`: `fc.stringOf(fc.char()).map(s => s + ":*")`
     - `arbPathScope`: `fc.stringOf(fc.char()).map(s => "file_path:" + s + "/**")`
   - Test all 5 properties from ADR-001 with `fc.assert(fc.property(...))`
   - File: `tests/unit/merger.properties.test.ts`
   - Test all 5 properties from ADR-002 with `fc.assert(fc.property(...))`
   - Use default runs (100 examples per property) or increase for critical properties

4. Write example-based unit tests:
   - File: `tests/unit/subsumption.test.ts`
   - Test known subsumption cases: `git:*` → `git log:*`, `npm:*` → `npm install:*`
   - Test non-subsumption cases: different types, same specificity
   - Test edge cases: empty strings, special characters, malformed patterns
   - File: `tests/unit/merger.test.ts`
   - Test conflict resolution: allow + deny → deny wins
   - Test deduplication: duplicates removed
   - Test sorting: alphabetical order maintained
   - Test statistics: counts accurate (added, subsumed, conflicts)

5. Verify all 10 properties hold:
   - Run property-based tests: `npm test -- subsumption.properties.test.ts`
   - Run property-based tests: `npm test -- merger.properties.test.ts`
   - Verify 0 failures across all properties

## Testing Strategy

**Level 1 (Unit):**

**Property-Based Tests (CRITICAL per handoff):**

> "YOU ABSOLUTELY POSITIVELY NEED property-based testing with fast-check"

The subsumption algorithm and conflict resolution have **mathematical properties** that must hold for ALL inputs. Example tests alone cannot prove correctness across the infinite input space.

Using fast-check, we generate random permission strings and verify:

- **ADR-001 Properties** (subsumption algorithm):
  1. Irreflexivity: No permission subsumes itself
  2. Transitivity: Subsumption relationship is transitive
  3. Anti-symmetry: If A subsumes B, B cannot subsume A
  4. Type consistency: Cross-type subsumption never occurs
  5. Idempotency: Removing subsumed permissions is idempotent

- **ADR-002 Properties** (conflict resolution):
  1. Determinism: Same input always produces same output
  2. Deny preservation: Deny list never shrinks
  3. No overlap: No permission in both lists after resolution
  4. Accurate counting: Conflict count matches actual conflicts
  5. Idempotency: Resolution is idempotent

**Example-Based Tests:**

Known cases from ADRs and real-world usage:

- `Bash(git:*)` subsumes `Bash(git log:*)`, `Bash(git worktree:*)`, `Bash(git branch:*)`
- `Bash(npm:*)` subsumes `Bash(npm install:*)`, `Bash(npm test:*)`
- `Read(file_path:/Users/user/Code/**)` subsumes `Read(file_path:/Users/user/Code/project-a/**)`
- Conflict: `Bash(docker:*)` in both allow and deny → stays in deny

**Level 2 (Integration):**

N/A - Subsumption and merger are pure logic functions tested exhaustively at Level 1 with property-based tests. Integration with full consolidation pipeline tested at feature level (see [settings-consolidation.trd.md](../settings-consolidation.trd.md)).

## Definition of Done

- [ ] `npm run typecheck` passes with 0 errors
- [ ] `npm test` passes all Level 1 tests (example-based + property-based)
- [ ] **All 10 property-based tests pass** (5 from ADR-001 + 5 from ADR-002)
- [ ] Test coverage ≥80% for `subsumption.ts` and `merger.ts`
- [ ] No `any` types without justification
- [ ] ADR-001 fully implemented and verified
- [ ] ADR-002 fully implemented and verified
- [ ] No mocking used (pure functional approach)
- [ ] fast-check integrated successfully
- [ ] Existing test files verified:
  - [ ] `tests/unit/subsumption.test.ts` exists and passes
  - [ ] `tests/unit/subsumption.properties.test.ts` exists and passes
  - [ ] `tests/unit/merger.test.ts` exists and passes
  - [ ] `tests/unit/merger.properties.test.ts` exists and passes
