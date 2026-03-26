# Capability: Scoped CLI Architecture

## Success Metric

**Quantitative Target:**

- **Baseline**: 2 root-level commands (`status`, `next`), no namespace extensibility
- **Target**: Domain-scoped architecture supporting 3+ domains (`spec`, `claude`, `marketplace`)
- **Measurement**:
  - All existing commands work under `spec` domain
  - Root aliases functional with deprecation warnings
  - Infrastructure ready for capability-32 to add new domains

## Testing Strategy

> Use `/testing-typescript` skill to understand testing strategy.

### Level Assignment

| Component           | Level | Justification                                                        |
| ------------------- | ----- | -------------------------------------------------------------------- |
| Domain router logic | 1     | Pure command routing, can verify logic without process execution     |
| CLI integration     | 2     | Must verify Commander.js parses nested commands and routes correctly |
| Full user journey   | 3     | Must verify installed binary works with real user workflows          |

### Escalation Rationale

- **1 → 2**: Unit tests prove routing logic works, but Level 2 verifies Commander.js correctly parses nested commands and passes options
- **2 → 3**: Integration tests prove individual commands work, but Level 3 verifies complete workflows (status → next → work) across migration period

## Capability E2E Tests (Level 3)

These tests verify the **complete user journey** delivers value.

### E2E1: Scoped commands work for existing workflows

```typescript
// tests/e2e/scoped-cli.e2e.test.ts
describe("Capability: Scoped CLI Architecture", () => {
  it("GIVEN existing spec workflow WHEN user runs scoped commands THEN status and next work correctly", async () => {
    // Given: Project with specs directory (existing fixture)
    const tempProject = await createTempProject();

    // When: User runs new scoped commands
    const statusResult = await exec("spx spec status --json", {
      cwd: tempProject,
    });
    const nextResult = await exec("spx spec next", { cwd: tempProject });

    // Then: Commands return correct results
    expect(statusResult.exitCode).toBe(0);
    const status = JSON.parse(statusResult.stdout);
    expect(status.summary).toHaveProperty("done");

    expect(nextResult.exitCode).toBe(0);
    expect(nextResult.stdout).toContain("story-");
  });
});
```

### E2E2: Backward compatibility with root aliases

```typescript
describe("Capability: Scoped CLI Architecture - Backward Compatibility", () => {
  it("GIVEN existing users WHEN they run old root commands THEN commands work with deprecation warning", async () => {
    // Given: Project setup
    const tempProject = await createTempProject();

    // When: User runs old command
    const result = await exec("spx status", { cwd: tempProject });

    // Then: Command works + shows warning
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain("deprecated");
    expect(result.stderr).toContain("spx spec status");
    expect(result.stdout).toContain("capability-"); // Shows status output
  });
});
```

### E2E3: New domains ready for extension

```typescript
describe("Capability: Scoped CLI Architecture - Extensibility", () => {
  it("GIVEN domain infrastructure WHEN new domain added THEN commands route correctly", async () => {
    // Given: Mock domain added to CLI
    // (This test validates the infrastructure, actual domains added in capability-32)

    // When: User runs help to see domains
    const result = await exec("spx --help");

    // Then: Domain structure visible
    expect(result.stdout).toContain("spx spec");
    expect(result.stdout).toContain("Manage spec workflow");
  });
});
```

## System Integration

This capability refactors the CLI foundation to support multiple command domains:

- Unblocks **capability-32** (claude-marketplace) which needs `claude` and `marketplace` domains
- Maintains backward compatibility with existing users of capability-21
- Establishes pattern for future domain additions (e.g., `config`, `doctor`)

## Completion Criteria

- [ ] All Level 1 tests pass (via feature/story completion)
- [ ] All Level 2 tests pass (via feature completion)
- [ ] All Level 3 E2E tests pass
- [ ] Success metric achieved (3+ domains supported)
- [ ] Existing commands work under `spec` domain
- [ ] Root aliases functional with warnings
- [ ] Documentation updated to show new command structure

**Note**: To see current features in this capability, use `ls` or `find` to list feature directories (e.g., `feature-*`) within this capability's folder.

---

## PRD Content (Merged)

> The following content was merged from the original capability-scoped PRD.

### Status of this Document: DoR Checklist

| DoR checkbox            | Description                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ |
| [x] **Outcome**         | Developers can use domain-scoped commands (spx spec, spx claude) with zero breaking changes during migration |
| [x] **Test Evidence**   | E2E tests verify scoped commands work, root aliases show deprecation warnings, new domains can be added      |
| [x] **Assumptions**     | Commander.js supports nested commands; users accept deprecation warnings during transition period            |
| [x] **Dependencies**    | capability-21_core-cli must be DONE; Commander.js CLI framework already in use                               |
| [x] **Pre-Mortem**      | User confusion during migration; documentation drift; alias removal breaks scripts                           |
| [x] **Deployment Plan** | Single npm release (v0.2.0) with scoped commands + aliases; document migration path                          |

### Problem Statement

#### Customer Problem

```
As a spx CLI maintainer, I am frustrated by flat command structure limiting extensibility
because adding new command domains (claude, marketplace) creates namespace collisions and poor UX,
which prevents me from shipping capability-32 (claude-marketplace management).
```

#### Current Customer Pain

- **Symptom**: Only two root commands (`status`, `next`); nowhere to add `claude init` or `marketplace sync`
- **Root Cause**: No namespace/domain architecture; all commands compete for root-level names
- **Customer Impact**: Cannot extend CLI without breaking changes or naming conflicts
- **Business Impact**: Blocks capability-32 (marketplace management); limits long-term CLI evolution

### Solution Design

#### Customer Solution

```
Implement domain-scoped CLI architecture where commands are grouped by domain (spec, claude, marketplace),
using Commander.js nested commands, resulting in extensible namespace structure
and smooth migration path via deprecated root aliases.
```

#### Customer Journey Context

- **Before**: Users run `spx status`, `spx next` (flat structure)
- **During**: Users can run `spx spec status` (new) or `spx status` (deprecated alias with warning)
- **After**: Users adopt `spx spec status`; aliases removed in v2.0; new domains (`claude`, `marketplace`) available

### Expected Outcome

#### Measurable Outcome

```
Developers will use domain-scoped commands for all operations,
leading to extensible CLI supporting 3+ domains without namespace conflicts,
proven by zero breaking changes during migration and successful addition of claude/marketplace domains.
```

#### Evidence of Success (BDD Tests)

- [x] `Command Structure: Current 2 root commands → Target 3+ domains (spec, claude, marketplace)`
- [x] `Backward Compatibility: Current 100% → Target 100% (root aliases work with warnings)`
- [x] `Extensibility: Current blocked → Target ready (capability-32 can add domains)`
- [x] `User Migration: Deprecation warnings guide users to new commands`

### Scope

#### In Scope (MVP)

- Domain-scoped architecture using Commander.js nested commands
- Three domains defined:
  - `spec` - Manage spec workflow (status, next, list, validate)
  - `claude` - User-facing plugin management (init, update, status)
  - `marketplace` - Developer-facing marketplace (status, update, reset, version)
- Backward compatibility: Root aliases (`spx status` → `spx spec status`) with deprecation warnings
- Infrastructure for adding new domains (router pattern, domain registration)
- Help text organized by domain
- Migration documentation in README

#### Explicit Non-Goals (MVP)

- Actually implementing `claude` and `marketplace` commands (that's capability-32)
- Removing root aliases (deferred to v2.0)
- Meta-command `spx status` that aggregates all domains (deferred to v0.3.0)
- Shell completion updates (can be added incrementally)

### Key Commands

#### Spec Domain (Migrated from Root)

- **`spx spec status [--format text|json|markdown|table]`**
  - Get project status (migrated from `spx status`)
  - Same behavior, new namespace

- **`spx spec next`**
  - Find next work item (migrated from `spx next`)
  - Same behavior, new namespace

#### Claude Domain (Infrastructure Only - Capability 32)

- **`spx claude init [--source <url>]`**
  - Install outcomeeng marketplace (implemented in capability-32)

- **`spx claude update`**
  - Update marketplace from source (implemented in capability-32)

- **`spx claude status`**
  - Show installation status (implemented in capability-32)

#### Marketplace Domain (Infrastructure Only - Capability 32)

- **`spx marketplace status [--json]`**
  - Show sync state (implemented in capability-32)

- **`spx marketplace update`**
  - Sync JSON from SKILL.md (implemented in capability-32)

#### Root Aliases (Deprecated, Backward Compatibility)

- **`spx status`** → Delegates to `spx spec status` with warning
- **`spx next`** → Delegates to `spx spec next` with warning

### Data Model

#### Domain Registration

```typescript
interface Domain {
  name: string; // "spec", "claude", "marketplace"
  description: string; // For help text
  commands: Command[]; // Commander.js commands
}

interface Command {
  name: string; // "status", "next", "init"
  description: string;
  options: CommandOption[];
  action: (options: any) => Promise<void>;
}
```

#### CLI Structure (No Data Model Changes)

Existing data models for work items, status, etc. remain unchanged. This is purely a CLI routing refactor.

### Dependencies

#### Work Item Dependencies

- [x] **capability-21_core-cli** - Must be DONE (provides core scanner, status, reporter)

#### Blocks

- [ ] **capability-32_claude-marketplace** - Needs domain infrastructure to add `claude` and `marketplace` commands

#### Technical Dependencies

- [x] **Commander.js** - Already in use, supports nested commands
- [x] **Node.js 18+** - Already required
- [ ] **Updated README** - Document new command structure

### Pre-Mortem Analysis

#### Risk: User confusion during migration period

- **Likelihood**: Medium — Some users won't see deprecation warnings in scripts
- **Impact**: Medium — Users might not migrate to new commands
- **Mitigation**:
  - Clear warnings in stderr (visible even in pipes)
  - Update README with migration guide
  - Keep aliases for 2+ major versions
  - Blog post/changelog announcement

#### Risk: Scripts break when aliases removed

- **Likelihood**: High — Users have automation scripts
- **Impact**: High — Breaking change causes CI failures
- **Mitigation**:
  - Long deprecation period (v0.2.0 → v2.0.0)
  - Document migration in BREAKING_CHANGES.md
  - Provide migration script (find/replace)
  - Only remove in major version

#### Risk: Documentation drift

- **Likelihood**: Medium — Multiple places to update
- **Impact**: Low — Confusing but not blocking
- **Mitigation**:
  - Update all docs in same PR
  - Checklist: README, CLAUDE.md, specs/CLAUDE.md, help text
  - Add note about aliases to CHANGELOG

#### Risk: Commander.js nested command quirks

- **Likelihood**: Low — Commander.js is mature
- **Impact**: Medium — Unexpected parsing behavior
- **Mitigation**:
  - Add integration tests for edge cases
  - Test with actual CLI (not just unit tests)
  - Document any quirks in ADR

### Deployment Plan

#### Structured around Features

This capability will be implemented through the following features:

1. **Feature: Spec Domain Migration**
   - Move existing commands under `spec` domain
   - Update command paths and imports
   - Verify existing tests still pass

2. **Feature: Domain Infrastructure**
   - Create domain router pattern
   - Add claude and marketplace domain stubs
   - Update help text organization

3. **Feature: Backward Compatibility**
   - Implement root aliases
   - Add deprecation warnings
   - Test alias delegation

4. **Feature: Documentation Update**
   - Update README with new command structure
   - Add migration guide
   - Update specs/CLAUDE.md examples

#### Command Summary

```bash
# New canonical interface
spx spec status                    # Get project status
spx spec status --json             # JSON output
spx spec next                      # Find next work item

# Domain stubs (implemented in capability-32)
spx claude --help                  # Will show: Commands coming soon
spx marketplace --help             # Will show: Commands coming soon

# Deprecated aliases (backward compatibility)
spx status                         # Works, shows warning
spx next                           # Works, shows warning
```

#### Success Criteria

- [x] `spx spec status` and `spx spec next` work identically to old commands
- [x] Root aliases work with clear deprecation warnings
- [x] `spx --help` shows organized domain structure
- [x] All existing tests pass without modification
- [x] README and docs updated
- [x] No breaking changes for current users
- [x] Infrastructure ready for capability-32 to add commands
