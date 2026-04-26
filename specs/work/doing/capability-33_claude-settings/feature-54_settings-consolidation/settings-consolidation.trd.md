# Technical Requirements Document (TRD)

## Status of this Document: DoR Checklist

| DoR checkbox          | Description                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------ |
| [ ] **Outcome**       | Consolidation pipeline merges project permissions into global settings with subsumption and backups    |
| [ ] **Test Evidence** | Property-based tests verify algebraic properties; integration tests verify multi-project consolidation |
| [ ] **Assumptions**   | Projects use `.claude/settings.local.json`; global at `~/.claude/settings.json`; fast-check available  |
| [ ] **Dependencies**  | fast-check for property-based testing, fs/promises, execa for integration tests                        |
| [ ] **Pre-Mortem**    | Permission format changes, path-specific permissions, backup restoration                               |

## Problem Statement

### Technical Problem

```
When Claude Code users work across multiple projects, permissions accumulate
in scattered `.claude/settings.local.json` files with duplicates and overlaps,
because Claude Code has no tooling to consolidate these permissions
into the global `~/.claude/settings.json` file with intelligent deduplication.
```

### Current Pain

- **Symptom**: Same permissions requested repeatedly across projects; scattered permission files; no central view; manual file editing required to sync
- **Root Cause**: Claude Code asks per-project but no tool consolidates to global settings; no subsumption detection (broader permissions don't remove narrower ones)
- **Impact**: Repetitive approval workflow slows development; permission drift creates inconsistency; users manually edit JSON files risking corruption; permission lists grow unbounded with duplicates

## Solution Design

### Technical Solution

```
Implement a consolidation pipeline that discovers all project-local permission files,
applies subsumption-based deduplication to remove narrower permissions when broader exist,
resolves conflicts with security-first approach (deny wins), creates timestamped backups,
and atomically writes the merged permissions to global settings,
resulting in zero duplicates and centralized permission management.
```

### Technical Architecture

**Components**:

1. **Discovery Module** (`src/lib/claude/permissions/discovery.ts`)
   - Recursively finds all `.claude/settings.local.json` files under root directory
   - Handles symlink loops with `visited` Set to prevent infinite recursion
   - Validates file accessibility before including in results
   - Pure async function: `findSettingsFiles(root: string) => Promise<string[]>`

2. **Parser Module** (`src/lib/claude/permissions/parser.ts`)
   - Parses JSON settings files and extracts permissions
   - Gracefully handles malformed JSON (returns `null` instead of throwing)
   - Validates basic structure (permissions object must be valid)
   - Pure functions: `parseSettingsFile()`, `parsePermission()`, `extractPermissions()`

3. **Subsumption Module** (`src/lib/claude/permissions/subsumption.ts` - ADR-001)
   - Detects when broader permissions subsume narrower ones
   - Algorithm: `Bash(git:*)` subsumes `Bash(git log:*)`, `Bash(git worktree:*)`, etc.
   - Supports command patterns (`:*` suffix) and path patterns (`**` recursive)
   - Properties verified by fast-check: irreflexivity, transitivity, anti-symmetry, type consistency, idempotency
   - Pure functions: `subsumes()`, `detectSubsumptions()`, `removeSubsumed()`

4. **Merger Module** (`src/lib/claude/permissions/merger.ts` - ADR-002)
   - Combines permissions from all sources (global + all local files)
   - Applies subsumption to remove redundant permissions
   - Resolves conflicts: when same permission in both allow and deny, prefer deny (more restrictive)
   - Deduplicates using Sets and sorts alphabetically
   - Tracks statistics: added, subsumed, conflicts resolved
   - Pure function: `mergePermissions()`

5. **Writer Module** (`src/lib/claude/settings/writer.ts` - ADR-003)
   - Writes settings atomically using temp file + rename pattern
   - Dependency injection with `FileSystem` interface (no mocking)
   - Cleanup: Removes temp file on write failure
   - Unique temp file names: timestamp + random to avoid collisions
   - Interface: `writeSettings(filePath, settings, deps = { fs: realFs })`

6. **Backup Module** (`src/lib/claude/settings/backup.ts`)
   - Creates timestamped backups before modifying global settings
   - Format: `settings.json.backup.YYYY-MM-DD-HHmmss` (e.g., `2026-01-08-143022`)
   - Verifies source file exists and is readable before backup
   - Pure async function: `createBackup(settingsPath: string) => Promise<string>`

7. **Reporter Module** (`src/lib/claude/settings/reporter.ts`)
   - Formats consolidation results as user-friendly text report
   - Shows: files scanned/processed/skipped, permissions added by category, conflicts resolved, subsumed permissions, backup path
   - Supports dry-run mode (shows preview with notice)
   - Pure function: `formatReport(result, dryRun) => string`

8. **Command Module** (`src/commands/claude/settings/consolidate.ts`)
   - CLI command: `spx claude settings consolidate [--dry-run] [--root <path>]`
   - Orchestrates pipeline: discover → parse → merge → backup → write → report
   - Default root: `~/Code/` (expandable via `--root` option)
   - Dry-run mode: runs full pipeline but skips backup/write steps

**Data Flow**:

```
┌─────────────────────────────────────────────────────────────────────┐
│                         User Command                                 │
│     spx claude settings consolidate [--dry-run] [--root ~/Code]     │
└────────────────────┬────────────────────────────────────────────────┘
                     │
                     ▼
          ┌──────────────────────┐
          │  1. Discovery        │
          │  findSettingsFiles() │ → [file1.json, file2.json, ...]
          └──────────┬───────────┘
                     │
                     ▼
          ┌──────────────────────┐
          │  2. Parser           │
          │  parseSettingsFile() │ → [{allow: [...], deny: [...]}, ...]
          └──────────┬───────────┘
                     │
                     ▼
          ┌──────────────────────┐
          │  3. Merger           │
          │  mergePermissions()  │
          │   ├─ Combine all     │
          │   ├─ Apply           │
          │   │  subsumption     │ (ADR-001: removeSubsumed())
          │   ├─ Resolve         │
          │   │  conflicts       │ (ADR-002: deny wins)
          │   ├─ Deduplicate     │ (Sets)
          │   └─ Sort            │ (alphabetical)
          └──────────┬───────────┘
                     │
                     ├─────────────────┐
                     │                 │
                     ▼                 ▼
          ┌──────────────────────┐    (if not --dry-run)
          │  4. Backup           │
          │  createBackup()      │ → settings.json.backup.YYYY-MM-DD-HHmmss
          └──────────┬───────────┘
                     │
                     ▼
          ┌──────────────────────┐
          │  5. Writer           │
          │  writeSettings()     │ (ADR-003: atomic writes with DI)
          │   ├─ Write temp file │
          │   ├─ Rename atomic   │
          │   └─ Cleanup on err  │
          └──────────┬───────────┘
                     │
                     ▼
          ┌──────────────────────┐
          │  6. Reporter         │
          │  formatReport()      │ → User-friendly summary
          └──────────────────────┘
```

**Configuration Priority**: None (stateless pipeline, no config files)

## Expected Outcome

### Technical Capability

```
The consolidation pipeline will discover all project-local permission files,
merge them with subsumption-based deduplication (removing narrower permissions),
resolve conflicts with security-first approach (deny wins),
create timestamped backups, and atomically write to global settings,
enabling centralized permission management with zero duplicates.
```

### Evidence of Success (BDD Tests)

- [ ] `Discovery: Recursively finds all .claude/settings.local.json files`
- [ ] `Parser: Handles malformed JSON gracefully without throwing`
- [ ] `Subsumption: Broader permissions remove narrower ones (e.g., git:* removes git log:*)`
- [ ] `Conflict Resolution: Deny wins when same permission in both allow and deny`
- [ ] `Backup: Creates timestamped backup before modifying global settings`
- [ ] `Atomic Writes: Uses temp file + rename pattern with cleanup on failure`
- [ ] `Property-Based Tests: All 10 algebraic properties verified with fast-check`
- [ ] `Multi-Project: Consolidates 20 projects in <2 seconds`
- [ ] `Dry-Run: Preview mode prevents all file modifications`

## End-to-End Tests

Complete technical integration test proving the pipeline works end-to-end:

```typescript
// tests/integration/claude/settings-consolidation.integration.test.ts
import { execa } from "execa";
import fs from "fs/promises";
import path from "path";
import { describe, expect, it } from "vitest";

describe("Feature: Settings Consolidation Pipeline", () => {
  it("GIVEN 20 projects with overlapping permissions WHEN consolidating THEN subsumption and conflict resolution work", async () => {
    // Given: Multi-project fixture with known overlaps
    const tempHome = await createTempHome();
    const projectsRoot = path.join(tempHome, "Code");

    await createMultiProjectFixture(projectsRoot, 20, {
      // These permissions should be subsumed
      allow: [
        "Bash(git:*)", // Broader
        "Bash(git log:*)", // Narrower (should be removed)
        "Bash(git worktree:*)", // Narrower (should be removed)
        "Bash(npm:*)",
        "Bash(npm install:*)", // Narrower (should be removed)
      ],
      // Conflict: Bash(docker:*) in both allow and deny
      allowInSome: ["Bash(docker:*)"],
      denyInOthers: ["Bash(docker:*)"],
    });

    // When: Run consolidation
    const { exitCode, stdout } = await execa("spx", [
      "claude",
      "settings",
      "consolidate",
      "--root",
      projectsRoot,
    ], {
      env: { HOME: tempHome },
    });

    // Then: Success
    expect(exitCode).toBe(0);

    // Read resulting global settings
    const globalSettings = await readJson(
      path.join(tempHome, ".claude/settings.json"),
    );

    // Subsumption worked: broader permissions present, narrower removed
    expect(globalSettings.allow).toContain("Bash(git:*)");
    expect(globalSettings.allow).not.toContain("Bash(git log:*)");
    expect(globalSettings.allow).not.toContain("Bash(git worktree:*)");
    expect(globalSettings.allow).toContain("Bash(npm:*)");
    expect(globalSettings.allow).not.toContain("Bash(npm install:*)");

    // Conflict resolution worked: deny wins
    expect(globalSettings.deny).toContain("Bash(docker:*)");
    expect(globalSettings.allow).not.toContain("Bash(docker:*)");
    expect(stdout).toContain("Conflict detected");

    // Backup created
    expect(stdout).toMatch(/Backup created:.*settings\.json\.backup\.2026-/);
    const backupFiles = await glob(
      path.join(tempHome, ".claude/settings.json.backup.*"),
    );
    expect(backupFiles.length).toBe(1);

    // Statistics accurate
    expect(stdout).toMatch(/Files scanned: 20/);
    expect(stdout).toContain("Permissions added");
    expect(stdout).toContain("Conflicts resolved: 1");
  });

  it("GIVEN dry-run mode WHEN consolidating THEN no files modified", async () => {
    // Given: Projects with permissions
    const tempHome = await createTempHomeWithSettings({ allow: ["Bash(ls:*)"] });
    const projectsRoot = await createMultiProjectFixture(
      path.join(tempHome, "Code"),
      5,
      { allow: ["Bash(git:*)"] },
    );

    const originalSettings = await readJson(
      path.join(tempHome, ".claude/settings.json"),
    );
    const originalModTime = (
      await fs.stat(path.join(tempHome, ".claude/settings.json"))
    ).mtimeMs;

    // When: Run with --dry-run
    const { exitCode, stdout } = await execa("spx", [
      "claude",
      "settings",
      "consolidate",
      "--root",
      projectsRoot,
      "--dry-run",
    ], {
      env: { HOME: tempHome },
    });

    // Then: Preview shown, no modifications
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Bash(git:*)");
    expect(stdout).toContain("Run without --dry-run to apply changes");

    const currentSettings = await readJson(
      path.join(tempHome, ".claude/settings.json"),
    );
    const currentModTime = (
      await fs.stat(path.join(tempHome, ".claude/settings.json"))
    ).mtimeMs;

    expect(currentSettings).toEqual(originalSettings);
    expect(currentModTime).toBe(originalModTime);

    // No backup created
    const backupFiles = await glob(
      path.join(tempHome, ".claude/settings.json.backup.*"),
    );
    expect(backupFiles.length).toBe(0);
  });
});
```

## Dependencies

### Work Item Dependencies

- [ ] None - Stories are children of this feature, not dependencies

Stories included in this feature:

- Story-21: Discovery and parsing modules
- Story-32: Subsumption and merging with property-based tests
- Story-43: Backup, atomic writes, and reporting

### Technical Dependencies

**Required npm Packages**:

- `fast-check` (v3.23.1+) - Property-based testing for subsumption and merger
- `execa` (v9.6.1+) - Command execution for integration tests
- `vitest` - Testing framework (already present)

**Node.js Built-ins**:

- `fs/promises` - File system operations (discovery, parser, writer, backup)
- `path` - Path manipulation (discovery, file paths)
- `os` - Temp directory for test fixtures (`os.tmpdir()`)

**Architectural Decisions**:

- [ADR-001: Subsumption Over Deduplication](../decisions/adr-001_subsumption-over-deduplication.md)
- [ADR-002: Security-First Conflict Resolution](../decisions/adr-002_security-first-conflict-resolution.md)
- [ADR-003: Atomic Writes with Temp Files](../decisions/adr-003_atomic-writes-with-temp-files.md)

## Pre-Mortem Analysis

### Assumption: Permission format stability

- **Likelihood**: Medium (Claude Code may change permission format in future releases)
- **Impact**: Medium (parser and subsumption algorithm would need updates)
- **Mitigation**:
  - Comprehensive error handling: Parser returns `null` for malformed JSON instead of throwing
  - Subsumption gracefully skips permissions it can't parse (logs warning, continues processing)
  - Add format version detection if Claude Code introduces breaking changes
  - Property-based tests verify algorithm correctness regardless of specific permission strings

### Assumption: Path-specific permissions handling

- **Likelihood**: Low (path-specific permissions like `Read(file_path:/Users/user/Code/project-a/**)` are edge case)
- **Impact**: Low (users may want to keep project-specific path permissions vs. consolidating them)
- **Mitigation**:
  - Document behavior: Path patterns are preserved as-is (not generalized automatically)
  - Reporter shows path-specific permissions separately in output
  - Future enhancement: `--generalize-paths` flag to convert project-specific paths to broader patterns
  - Property-based tests verify path subsumption works correctly (`/Users/user/Code/**` subsumes `/Users/user/Code/project-a/**`)

### Assumption: Backup restoration process

- **Likelihood**: Low (atomic writes minimize corruption risk, but user error possible)
- **Impact**: High (if global settings corrupted, user needs manual restoration from backup)
- **Mitigation**:
  - Document backup file format and location in CLI output
  - Atomic writes with temp file pattern (ADR-003) prevent partial writes
  - Backup created BEFORE any modifications (fail-safe approach)
  - Future enhancement: `spx claude settings restore --backup <path>` command
  - Integration tests verify backup files are valid JSON and can be parsed

### Assumption: Performance at scale

- **Likelihood**: Low (100+ projects with 1000+ permissions each could be slow)
- **Impact**: Medium (user experience degrades if consolidation takes >5 seconds)
- **Mitigation**:
  - Capability specifies <2s for 20 projects as acceptance criteria
  - Use streaming/async processing (current implementation is async throughout)
  - Subsumption algorithm is O(n²) but optimized (early exits, processed tracking)
  - Future enhancement: Parallel file discovery and parsing if performance issues emerge

### Assumption: Symlink loop detection

- **Likelihood**: Low (most users don't have complex symlink structures in project directories)
- **Impact**: Medium (infinite recursion would hang discovery, OOM crash)
- **Mitigation**:
  - Discovery tracks visited directories with `Set<string>` (already implemented)
  - Early return when directory already visited prevents infinite loops
  - Integration tests verify symlink handling with fixture containing loops
