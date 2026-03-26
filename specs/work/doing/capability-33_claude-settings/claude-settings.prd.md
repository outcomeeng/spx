# Product Requirements Document (PRD)

## spx claude — Claude Code Settings Management

## Status of this Document: DoR Checklist

| DoR checkbox            | Description                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| [ ] **Outcome**         | Users can manage Claude Code config: install/update marketplace, consolidate permissions across projects                  |
| [ ] **Test Evidence**   | CLI correctly installs marketplace, updates from source, consolidates permissions with deduplication and backup           |
| [ ] **Assumptions**     | Users have Claude Code installed; projects use standard `.claude/` structure; global config at `~/.claude/settings.json`  |
| [ ] **Dependencies**    | spx-cli core (Capability 21), git for marketplace cloning, Claude Code plugin schema                                      |
| [ ] **Pre-Mortem**      | Claude Code config format changes; conflicting permissions (allow vs deny); path-specific permissions need generalization |
| [ ] **Deployment Plan** | Commands under `spx claude` namespace; supports --dry-run for safety; automatic backups before modification               |

---

## Problem Statement

### Customer Problem

```
As a Claude Code user, I face two interconnected problems:

1. I must manually install and update the outcomeeng marketplace,
   which is error-prone and requires knowing the source URL.

2. I constantly re-approve the same permissions across multiple projects,
   creating duplicate permissions in each project's .claude/settings.local.json,
   with no central view or management of granted permissions.

This prevents me from efficiently managing my Claude Code environment
and wastes time on repetitive permission approvals.
```

### Current Customer Pain

**Marketplace Management:**

- **Symptom**: Manual clone/copy of marketplace files; forgetting to update; not knowing source URL
- **Root Cause**: No tooling to manage marketplace installation in Claude Code
- **Customer Impact**: Outdated plugins, manual installation friction, missed features

**Permissions Management:**

- **Symptom**: Same permissions requested repeatedly across projects; scattered permission files; no central view
- **Root Cause**: Claude Code asks per-project but no tool consolidates to global settings
- **Customer Impact**: Repetitive approval workflow, permission drift, manual file editing to sync

---

## Solution Design

### Customer Solution

```
Implement spx claude subcommands that:

1. Install and update the outcomeeng marketplace from a configured source,
   reading Claude Code's configuration to enable one-command management.

2. Consolidate all project-local permissions into the global settings file,
   deduplicating and organizing them with automatic backup and dry-run support.

This results in streamlined marketplace updates and centralized permission management.
```

---

## Commands: `spx claude`

### Marketplace Management

#### `spx claude init [--source <url|path>]`

Install outcomeeng marketplace into user's Claude Code setup.

```bash
# Install from GitHub (default)
spx claude init

# Install from local path (development)
spx claude init --source ~/Code/spx/outcomeeng/claude
```

**Behavior:**

1. Detect Claude Code plugins directory (`~/.claude/plugins/` or platform equivalent)
2. If `--source` not provided, use default: `https://github.com/shz/outcomeeng/claude`
3. Clone/copy marketplace to plugins cache
4. Register marketplace in Claude Code settings

**Exit Codes:**

- `0` - Success
- `1` - Claude Code not found or invalid source
- `2` - Network/git errors

---

#### `spx claude update`

Fetch updates from the marketplace source configured in Claude Code.

```bash
spx claude update
```

**Behavior:**

1. Read Claude Code's plugin configuration to find marketplace source
2. Fetch latest from that source (git pull for remote, copy for local)
3. Report what changed (new plugins, updated skills)

**Exit Codes:**

- `0` - Success (updated or already up-to-date)
- `1` - No marketplace installed or source unreachable
- `2` - Update failed (conflicts, network errors)

---

#### `spx claude status`

Show installed marketplace status.

```bash
spx claude status
```

**Output:**

- Marketplace source (GitHub URL or local path)
- Current version/commit
- Available updates (if any)
- Installed plugins list

**Exit Codes:**

- `0` - Success
- `1` - No marketplace installed

---

### Settings Management

#### `spx claude settings consolidate [--dry-run] [--root <path>]`

Consolidate all project-local permissions into global settings file.

```bash
# Consolidate from default ~/Code/ directory
spx claude settings consolidate

# Preview changes without modifying files
spx claude settings consolidate --dry-run

# Consolidate from custom directory
spx claude settings consolidate --root ~/Projects
```

**Behavior:**

1. **Discover**: Recursively find all `.claude/settings.local.json` files under root directory (default: `~/Code/`)
2. **Read**: Load global `~/.claude/settings.json` file
3. **Merge**: Combine permissions from all local files into global settings:
   - Deduplicate using Sets (same permission string only appears once)
   - Preserve all three permission types: `allow`, `deny`, `ask`
   - Maintain alphabetical sorting within each type
4. **Conflict Detection**: When same permission exists in both `allow` and `deny`:
   - Prefer `deny` (more restrictive, safer)
   - Report conflict to user with warning
5. **Backup**: Create timestamped backup: `~/.claude/settings.json.backup.YYYY-MM-DD-HHmmss`
6. **Write**: Atomically write updated global settings (skip if `--dry-run`)
7. **Report**: Show summary statistics and list of newly added permissions

**Output Format:**

```
Scanning for Claude Code settings files...
Found 12 settings files across 8 projects

Global settings: ~/.claude/settings.json
Backup created: ~/.claude/settings.json.backup.2026-01-08-143022

Permissions to add:
  allow:
    + Bash(git:*)
    + Bash(npm:*)
    + Read(file_path:**/*.ts)
  deny:
    + Bash(rm -rf:*)
  ask:
    + WebFetch(domain:*)

Summary:
  Files scanned: 12
  Permissions added: 5 allow, 1 deny, 1 ask
  Conflicts resolved: 0
  Global settings updated: ✓

Run without --dry-run to apply changes.
```

**Exit Codes:**

- `0` - Success
- `1` - No settings files found or invalid root directory
- `2` - Conflicts detected and could not auto-resolve
- `3` - Backup or write failed

**Special Handling for Path-Specific Permissions:**

Permissions like `Read(file_path:/Users/shz/Code/project-a/**)` are:

- Preserved as-is (not generalized automatically)
- Reported separately in output as "project-specific permissions"
- User can manually review and decide whether to keep or generalize

**Conflict Resolution:**

When a permission exists in both `allow` and `deny` across different files:

```
⚠️  Conflict detected:
  Bash(docker:*) appears in:
    - allow: ~/Code/project-a/.claude/settings.local.json
    - deny: ~/Code/project-b/.claude/settings.local.json

  Resolution: Using 'deny' (more restrictive)
```

---

#### Future Commands (Not in Initial Scope)

These are documented for planning but NOT implemented in initial release:

```bash
# List all permissions in global settings (grouped by type)
spx claude settings list [--type allow|deny|ask]

# Remove duplicate permissions from local files that exist in global
spx claude settings clean [--dry-run]

# Show which projects have specific permission
spx claude settings find <permission-pattern>
```

---

## Data Models

### Marketplace Installation

```typescript
interface MarketplaceInstallation {
  path: string; // Where marketplace is installed
  source: string; // GitHub URL or local path
  version: string; // Current version/commit
  plugins: string[]; // Installed plugin names
  lastUpdated: Date;
}
```

### Settings Consolidation

```typescript
interface ClaudeSettings {
  allow?: string[];
  deny?: string[];
  ask?: string[];
  hooks?: Record<string, unknown>; // Preserved from global, not modified
  // ... other Claude Code settings
}

interface PermissionSource {
  permission: string;
  sourceFile: string; // Relative path from home (~/Code/...)
  type: "allow" | "deny" | "ask";
}

interface ConsolidationResult {
  filesScanned: number;
  permissionsAdded: {
    allow: number;
    deny: number;
    ask: number;
  };
  conflictsResolved: number;
  backupPath: string;
  newPermissions: PermissionSource[];
  conflicts: PermissionConflict[];
}

interface PermissionConflict {
  permission: string;
  sources: {
    allow?: string[]; // Files with this permission in allow
    deny?: string[]; // Files with this permission in deny
  };
  resolution: "deny" | "ask-user";
}
```

---

## Architecture

### Directory Structure

```
src/
├── claude/                          # User-facing commands
│   ├── index.ts                     # spx claude entry point
│   ├── init.ts                      # Install marketplace
│   ├── update.ts                    # Update from source
│   ├── status.ts                    # Show installation status
│   └── settings/
│       ├── index.ts                 # spx claude settings entry
│       ├── consolidate.ts           # Consolidate permissions
│       └── consolidator.ts          # Core consolidation logic
├── claude/lib/
│   ├── claude-config.ts             # Read/write Claude Code config
│   ├── marketplace-installer.ts    # Marketplace install/update logic
│   └── permissions.ts               # Permission parsing/merging
└── claude/lib/consolidation/
    ├── scanner.ts                   # Find settings files
    ├── merger.ts                    # Merge permissions with deduplication
    ├── conflict-resolver.ts         # Handle allow/deny conflicts
    └── backup.ts                    # Backup management
```

### Key Modules

#### `claude-config.ts` - Claude Code Configuration

```typescript
export interface ClaudeCodePaths {
  configDir: string; // ~/.claude/
  globalSettings: string; // ~/.claude/settings.json
  pluginsDir: string; // ~/.claude/plugins/
  pluginsCache: string; // ~/.claude/plugins/cache/
}

export function detectClaudeCodePaths(): ClaudeCodePaths;
export function readGlobalSettings(): ClaudeSettings;
export function writeGlobalSettings(settings: ClaudeSettings): void;
export function createBackup(settingsPath: string): string;
```

#### `permissions.ts` - Permission Operations

```typescript
export function parsePermissions(settings: ClaudeSettings): {
  allow: Set<string>;
  deny: Set<string>;
  ask: Set<string>;
};

export function mergePermissions(
  global: ClaudeSettings,
  local: ClaudeSettings[],
): {
  merged: ClaudeSettings;
  added: PermissionSource[];
  conflicts: PermissionConflict[];
};

export function detectConflicts(
  sources: PermissionSource[],
): PermissionConflict[];
```

#### `scanner.ts` - Settings File Discovery

```typescript
export interface SettingsFile {
  path: string; // Absolute path
  relativePath: string; // Relative to root (~/ prefix)
  settings: ClaudeSettings;
}

export async function findSettingsFiles(
  rootDir: string,
): Promise<SettingsFile[]>;
```

---

## End-to-End Tests

### User Journey: Marketplace Management

```typescript
describe("Feature: spx claude init", () => {
  test("installs marketplace from GitHub", async () => {
    const tempHome = await createTempHome();

    const { exitCode, stdout } = await execa("spx", ["claude", "init"], {
      env: { HOME: tempHome },
    });

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Marketplace installed");
    expect(
      await exists(path.join(tempHome, ".claude/plugins/cache/outcomeeng/claude")),
    ).toBe(true);
  });

  test("installs from local path with --source", async () => {
    const tempHome = await createTempHome();
    const localMarketplace = await createTempMarketplace();

    const { exitCode } = await execa("spx", [
      "claude",
      "init",
      "--source",
      localMarketplace,
    ], {
      env: { HOME: tempHome },
    });

    expect(exitCode).toBe(0);
  });
});

describe("Feature: spx claude update", () => {
  test("updates from configured source", async () => {
    const tempHome = await createTempHomeWithMarketplace();

    const { exitCode, stdout } = await execa("spx", ["claude", "update"], {
      env: { HOME: tempHome },
    });

    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/Updated|Already up-to-date/);
  });
});

describe("Feature: spx claude status", () => {
  test("shows marketplace installation info", async () => {
    const tempHome = await createTempHomeWithMarketplace();

    const { exitCode, stdout } = await execa("spx", ["claude", "status"], {
      env: { HOME: tempHome },
    });

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Source:");
    expect(stdout).toContain("Version:");
  });
});
```

### User Journey: Settings Consolidation

```typescript
describe("Feature: spx claude settings consolidate", () => {
  test("consolidates permissions from multiple projects", async () => {
    // Given: Multiple projects with local settings
    const tempHome = await createTempHome();
    const projectsRoot = await createMultiProjectFixture(tempHome, {
      projectA: {
        allow: ["Bash(git:*)", "Read(file_path:**/*.ts)"],
      },
      projectB: {
        allow: ["Bash(npm:*)"],
        deny: ["Bash(rm -rf:*)"],
      },
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

    // Then: Permissions consolidated
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Files scanned: 2");
    expect(stdout).toContain("Bash(git:*)");
    expect(stdout).toContain("Bash(npm:*)");

    // Verify global settings updated
    const globalSettings = await readJson(
      path.join(tempHome, ".claude/settings.json"),
    );
    expect(globalSettings.allow).toContain("Bash(git:*)");
    expect(globalSettings.allow).toContain("Bash(npm:*)");
    expect(globalSettings.deny).toContain("Bash(rm -rf:*)");
  });

  test("deduplicates permissions across projects", async () => {
    const tempHome = await createTempHome();
    const projectsRoot = await createMultiProjectFixture(tempHome, {
      projectA: { allow: ["Bash(git:*)", "Bash(npm:*)"] },
      projectB: { allow: ["Bash(git:*)", "Read(file_path:**/*.ts)"] },
    });

    const { exitCode, stdout } = await execa("spx", [
      "claude",
      "settings",
      "consolidate",
      "--root",
      projectsRoot,
    ], {
      env: { HOME: tempHome },
    });

    expect(exitCode).toBe(0);
    const globalSettings = await readJson(
      path.join(tempHome, ".claude/settings.json"),
    );

    // Bash(git:*) should appear only once
    expect(
      globalSettings.allow.filter((p: string) => p === "Bash(git:*)").length,
    ).toBe(1);
  });

  test("creates backup before modifying global settings", async () => {
    const tempHome = await createTempHomeWithSettings({
      allow: ["Bash(ls:*)"],
    });
    const projectsRoot = await createMultiProjectFixture(tempHome, {
      projectA: { allow: ["Bash(git:*)"] },
    });

    const { exitCode, stdout } = await execa("spx", [
      "claude",
      "settings",
      "consolidate",
      "--root",
      projectsRoot,
    ], {
      env: { HOME: tempHome },
    });

    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/Backup created:.*settings\.json\.backup/);

    // Verify backup exists and contains original settings
    const backupFiles = await glob(
      path.join(tempHome, ".claude/settings.json.backup.*"),
    );
    expect(backupFiles.length).toBe(1);

    const backup = await readJson(backupFiles[0]);
    expect(backup.allow).toContain("Bash(ls:*)");
  });

  test("dry-run mode does not modify files", async () => {
    const tempHome = await createTempHomeWithSettings({
      allow: ["Bash(ls:*)"],
    });
    const projectsRoot = await createMultiProjectFixture(tempHome, {
      projectA: { allow: ["Bash(git:*)"] },
    });

    const originalSettings = await readJson(
      path.join(tempHome, ".claude/settings.json"),
    );

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

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Run without --dry-run to apply changes");

    // Verify settings unchanged
    const currentSettings = await readJson(
      path.join(tempHome, ".claude/settings.json"),
    );
    expect(currentSettings).toEqual(originalSettings);
  });

  test("resolves allow/deny conflicts by preferring deny", async () => {
    const tempHome = await createTempHome();
    const projectsRoot = await createMultiProjectFixture(tempHome, {
      projectA: { allow: ["Bash(docker:*)"] },
      projectB: { deny: ["Bash(docker:*)"] },
    });

    const { exitCode, stdout } = await execa("spx", [
      "claude",
      "settings",
      "consolidate",
      "--root",
      projectsRoot,
    ], {
      env: { HOME: tempHome },
    });

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Conflict detected");
    expect(stdout).toContain("Bash(docker:*)");
    expect(stdout).toContain("Resolution: Using 'deny'");

    const globalSettings = await readJson(
      path.join(tempHome, ".claude/settings.json"),
    );
    expect(globalSettings.deny).toContain("Bash(docker:*)");
    expect(globalSettings.allow).not.toContain("Bash(docker:*)");
  });

  test("handles missing global settings file gracefully", async () => {
    const tempHome = await createTempHome();
    // No global settings.json exists
    const projectsRoot = await createMultiProjectFixture(tempHome, {
      projectA: { allow: ["Bash(git:*)"] },
    });

    const { exitCode } = await execa("spx", [
      "claude",
      "settings",
      "consolidate",
      "--root",
      projectsRoot,
    ], {
      env: { HOME: tempHome },
    });

    expect(exitCode).toBe(0);

    // Verify settings.json created
    const globalSettings = await readJson(
      path.join(tempHome, ".claude/settings.json"),
    );
    expect(globalSettings.allow).toContain("Bash(git:*)");
  });
});
```

---

## Pre-Mortem Analysis

### Risk: Claude Code config format changes

- **Likelihood**: Medium — Claude Code is actively developed
- **Impact**: High — Commands fail to read/write config
- **Mitigation**: Version-pin config parsing; fallback to defaults; clear error messages; test with multiple Claude Code versions

### Risk: Conflicting permissions across projects

- **Likelihood**: High — Users have different security needs per project
- **Impact**: Medium — Auto-resolution may be too restrictive
- **Mitigation**: Prefer deny (safer); report all conflicts; future: interactive mode to ask user

### Risk: Path-specific permissions need generalization

- **Likelihood**: Medium — Many permissions include absolute paths
- **Impact**: Low — Consolidated permissions may not work across projects
- **Mitigation**: Preserve as-is initially; report separately; document manual review needed; future: pattern detection and generalization

### Risk: Large number of permissions to consolidate

- **Likelihood**: Medium — Users with many projects
- **Impact**: Low — Output overwhelming
- **Mitigation**: Summary statistics; group by type; --json output for tooling; future: pagination or filtering

### Risk: Marketplace source becomes unavailable

- **Likelihood**: Low — GitHub is reliable
- **Impact**: Medium — Cannot install/update
- **Mitigation**: Support local source; clear error messages; cache last-known-good version

### Risk: Permission format changes in Claude Code

- **Likelihood**: Medium — Permission system may evolve
- **Impact**: High — Consolidation breaks
- **Mitigation**: Test against Claude Code releases; version detection; graceful degradation

---

## Deployment Plan

### Features

#### Phase 1: Marketplace Management (Foundational)

1. **Feature: Claude Init** — `spx claude init` with GitHub/local source
2. **Feature: Claude Update** — `spx claude update` from configured source
3. **Feature: Claude Status** — `spx claude status` for installation info

#### Phase 2: Settings Consolidation (Core Value)

4. **Feature: Settings Consolidate** — `spx claude settings consolidate` with:
   - Recursive file discovery
   - Permission deduplication
   - Conflict resolution (prefer deny)
   - Automatic backup
   - Dry-run support
   - Summary reporting

#### Phase 3: Future Enhancements (Not Initial Scope)

5. **Feature: Settings List** — `spx claude settings list` to view permissions
6. **Feature: Settings Clean** — Remove duplicates from local files
7. **Feature: Settings Find** — Search for specific permissions

---

## Command Summary

```bash
# Marketplace management
spx claude init                              # Install outcomeeng marketplace
spx claude init --source ~/local             # Install from local path
spx claude update                            # Update from configured source
spx claude status                            # Show installation status

# Settings consolidation
spx claude settings consolidate              # Consolidate permissions
spx claude settings consolidate --dry-run    # Preview without changes
spx claude settings consolidate --root ~/Projects  # Custom root directory
```

---

## Success Criteria

**Marketplace Management:**

- [ ] `spx claude init` installs marketplace in <5s
- [ ] `spx claude update` correctly fetches from configured source
- [ ] `spx claude status` shows accurate installation information

**Settings Consolidation:**

- [ ] Discovers all `.claude/settings.local.json` files recursively
- [ ] Correctly deduplicates permissions across projects
- [ ] Resolves allow/deny conflicts by preferring deny
- [ ] Creates timestamped backup before modifying global settings
- [ ] Dry-run mode shows changes without modifying files
- [ ] Reports clear summary with file count and permissions added
- [ ] Handles missing global settings.json gracefully
- [ ] Consolidation completes in <2s for 20 projects

**Quality:**

- [ ] All Level 1 tests pass (unit tests for pure functions)
- [ ] All Level 2 tests pass (integration tests with real FS)
- [ ] All Level 3 E2E tests pass (complete workflows)
- [ ] Zero regression in existing spx commands
- [ ] Documentation complete with examples
