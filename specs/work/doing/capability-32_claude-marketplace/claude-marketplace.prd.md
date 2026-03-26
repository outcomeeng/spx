# Product Requirements Document (PRD)

## spx claude + spx marketplace — Claude Code Plugin Management

## Status of this Document: DoR Checklist

| DoR checkbox            | Description                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| [ ] **Outcome**         | Users can install/update marketplace; developers get automated JSON maintenance from SKILL.md                             |
| [ ] **Test Evidence**   | CLI correctly installs marketplace, syncs JSON, validates schema, manages versions via Conventional Commits               |
| [ ] **Assumptions**     | Projects use standard Claude Code plugin structure; Conventional Commits convention followed; outcomeeng/claude on GitHub |
| [ ] **Dependencies**    | spx-cli core (Capability 21), git for version detection, Claude Code plugin schema                                        |
| [ ] **Pre-Mortem**      | Schema drift as Claude Code evolves; Conventional Commits not followed; GitHub rate limits                                |
| [ ] **Deployment Plan** | Two subcommands of existing spx CLI; pre-commit hook integration via lefthook/husky                                       |

## Two Audiences, Two Command Namespaces

| Namespace         | Audience                   | Purpose                                                                |
| ----------------- | -------------------------- | ---------------------------------------------------------------------- |
| `spx claude`      | **Users**                  | Install and update outcomeeng marketplace in their Claude Code setup   |
| `spx marketplace` | **Marketplace developers** | Maintain JSON files, versioning, pre-commit hooks in marketplace repos |

---

# Part 1: `spx claude` — User-Facing Commands

## Problem Statement

### Customer Problem

```
As a Claude Code user, I want to easily install and update the outcomeeng marketplace
because manual installation is error-prone and updates require knowing the source URL,
which prevents me from benefiting from the latest plugin improvements.
```

### Current Customer Pain

- **Symptom**: Manual clone/copy of marketplace files; forgetting to update; not knowing source URL
- **Root Cause**: No tooling to manage marketplace installation in Claude Code
- **Customer Impact**: Outdated plugins, manual installation friction, missed features

## Solution Design

### Customer Solution

```
Implement spx claude subcommands that install and update the outcomeeng marketplace
by reading Claude Code's configuration to determine the source,
resulting in one-command installation and updates.
```

## Commands: `spx claude`

### `spx claude init [--source <url|path>]`

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

### `spx claude update`

Fetch updates from the marketplace source configured in Claude Code.

```bash
spx claude update
```

**Behavior:**

1. Read Claude Code's plugin configuration to find marketplace source
2. Fetch latest from that source (git pull for remote, copy for local)
3. Report what changed (new plugins, updated skills)

### `spx claude status`

Show installed marketplace status.

```bash
spx claude status
```

**Output:**

- Marketplace source (GitHub URL or local path)
- Current version/commit
- Available updates (if any)
- Installed plugins list

---

# Part 2: `spx marketplace` — Developer-Facing Commands

## Problem Statement

### Customer Problem

```
As a Claude Code marketplace maintainer, I am frustrated by manual JSON file maintenance
because marketplace JSON files (marketplace.json, plugin.json, skill.json) drift from source SKILL.md files,
which prevents me from confidently publishing plugins and requires tedious manual updates.
```

### Current Customer Pain

- **Symptom**: JSON files out of sync with SKILL.md content; version numbers stale; new skills not added to manifests
- **Root Cause**: No automated tooling to derive JSON from source files; manual version management
- **Customer Impact**: Plugin publishing errors, outdated marketplace listings, time wasted on manual sync

## Solution Design

### Customer Solution

```
Implement spx marketplace subcommands that treat SKILL.md files as source of truth,
automatically generating and validating marketplace JSON files,
resulting in zero-drift plugin manifests and automated version management.
```

## Commands: `spx marketplace`

### `spx marketplace status [--json]`

Show sync state between SKILL.md sources and JSON manifests.

```bash
spx marketplace status
spx marketplace status --json
```

**Behavior:**

- Scan for SKILL.md files and their corresponding JSON
- Report drift (SKILL.md newer than JSON)
- Exit 0 if synced, 1 if drift detected

### `spx marketplace update`

Sync JSON files from SKILL.md sources.

```bash
spx marketplace update
```

**Behavior:**

1. Extract metadata from SKILL.md files (description, etc.)
2. Derive names from directory structure
3. Compute version from Conventional Commits
4. Generate/update JSON files

### `spx marketplace reset --force`

Force-regenerate all JSON from SKILL.md sources.

```bash
spx marketplace reset --force
```

**Behavior:**

- Regenerate all JSON files from scratch
- Requires `--force` flag (destructive)
- Warns about discarding manual edits

### `spx marketplace init`

Initialize a new marketplace project structure.

```bash
spx marketplace init
```

**Behavior:**

- Create marketplace.json
- Create plugins/ directory structure
- Set up recommended pre-commit hook config

### `spx marketplace version [--dry-run] [major]`

Manage versions based on Conventional Commits.

```bash
spx marketplace version           # Show current + next version
spx marketplace version --dry-run # Preview without applying
spx marketplace version major     # Explicit major bump
```

**Version Rules:**

- `feat!:` → Minor bump (0.1.0 → 0.2.0)
- All other commits → Patch bump (0.1.0 → 0.1.1)
- `major` subcommand → Major bump (0.x.x → 1.0.0)

---

# Shared Architecture

## Source of Truth (for `spx marketplace`)

```
SKILL.md (source) ─────────────────────────────────┐
                                                   │
Directory structure (name) ────────────────────────┼──► Extractor ──► Generator ──► JSON
                                                   │
Git history (version) ─────────────────────────────┘
```

## Directory Structure

```
spx/
├── src/
│   ├── cli.ts                      # Register both subcommands
│   ├── claude/                     # User-facing commands
│   │   ├── index.ts                # spx claude entry
│   │   ├── init.ts                 # Install marketplace
│   │   ├── update.ts               # Update from source
│   │   └── status.ts               # Show installation status
│   ├── marketplace/                # Developer-facing commands
│   │   ├── index.ts                # spx marketplace entry
│   │   ├── status.ts               # Sync status detection
│   │   ├── update.ts               # JSON sync from sources
│   │   ├── reset.ts                # Force regeneration
│   │   ├── init.ts                 # Project initialization
│   │   └── version.ts              # Conventional Commits versioning
│   ├── marketplace/extractors/
│   │   ├── skill-md.ts             # Extract metadata from SKILL.md
│   │   └── directory.ts            # Derive names from directory structure
│   ├── marketplace/generators/
│   │   ├── plugin-json.ts          # Generate plugin.json
│   │   ├── skill-json.ts           # Generate skill.json
│   │   └── marketplace-json.ts     # Generate marketplace.json
│   └── marketplace/git/
│       └── conventional.ts         # Conventional Commits analysis
```

## Data Models

### For `spx claude` (User)

```typescript
interface MarketplaceInstallation {
  path: string; // Where marketplace is installed
  source: string; // GitHub URL or local path
  version: string; // Current version/commit
  plugins: string[]; // Installed plugin names
  lastUpdated: Date;
}
```

### For `spx marketplace` (Developer)

```typescript
interface SyncStatus {
  root: string;
  plugins: PluginStatus[];
  summary: {
    synced: number;
    outOfSync: number;
    missing: number;
  };
}

interface PluginStatus {
  name: string;
  path: string;
  state: "synced" | "out-of-sync" | "missing-json" | "missing-source";
  currentVersion: string;
  nextVersion: string | null;
  skills: SkillStatus[];
}

interface VersionBump {
  current: string;
  next: string;
  reason: "feat!" | "feat" | "fix" | "chore" | "explicit-major";
  commits: ConventionalCommit[];
}
```

---

# End-to-End Tests

## User Journey: `spx claude`

```typescript
describe("Feature: spx claude init", () => {
  test("installs marketplace from GitHub", async () => {
    const tempHome = await createTempHome();

    const { exitCode } = await execa("spx", ["claude", "init"], {
      env: { HOME: tempHome },
    });

    expect(exitCode).toBe(0);
    expect(
      await exists(path.join(tempHome, ".claude/plugins/cache/outcomeeng/claude")),
    ).toBe(true);
  });
});

describe("Feature: spx claude update", () => {
  test("updates from configured source", async () => {
    const tempHome = await createTempHomeWithMarketplace();

    const { exitCode, stdout } = await execa("spx", ["claude", "update"], {
      env: { HOME: tempHome },
    });

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Updated");
  });
});
```

## Developer Journey: `spx marketplace`

```typescript
describe("Feature: spx marketplace status", () => {
  test("detects out-of-sync JSON files", async () => {
    const fixtureRoot = "test/fixtures/marketplace/out-of-sync";

    const { exitCode, stdout } = await execa("spx", [
      "marketplace",
      "status",
      "--json",
    ], {
      cwd: fixtureRoot,
    });

    expect(exitCode).toBe(1);
    const status = JSON.parse(stdout);
    expect(status.summary.outOfSync).toBeGreaterThan(0);
  });
});

describe("Feature: spx marketplace update", () => {
  test("syncs JSON from SKILL.md sources", async () => {
    const fixtureRoot = await createTempFixture("out-of-sync");

    const { exitCode } = await execa("spx", ["marketplace", "update"], {
      cwd: fixtureRoot,
    });

    expect(exitCode).toBe(0);
    const pluginJson = await readJson(
      path.join(fixtureRoot, "plugins/typescript/.claude-plugin/plugin.json"),
    );
    expect(pluginJson.skills).toContainEqual(
      expect.objectContaining({ name: "testing-typescript" }),
    );
  });
});

describe("Feature: spx marketplace version", () => {
  test("increments version based on Conventional Commits", async () => {
    const fixtureRoot = await createTempFixture("version-test");

    const { stdout } = await execa("spx", [
      "marketplace",
      "version",
      "--dry-run",
    ], {
      cwd: fixtureRoot,
    });

    expect(stdout).toContain("0.1.0 → 0.2.0");
  });
});
```

---

# Pre-Mortem Analysis

### Risk: Claude Code config format changes

- **Likelihood**: Medium — Claude Code is actively developed
- **Impact**: High — `spx claude` commands fail
- **Mitigation**: Version-pin config parsing; fallback to defaults; clear error messages

### Risk: GitHub rate limits for `spx claude init/update`

- **Likelihood**: Low — Single user won't hit limits
- **Impact**: Low — Just retry later
- **Mitigation**: Support local source; cache responses; provide clear error

### Risk: Claude Code plugin schema changes

- **Likelihood**: Medium — Claude Code is actively developed
- **Impact**: High — `spx marketplace` generates invalid JSON
- **Mitigation**: Fetch schema from Claude Code docs; version-pin schema; validate on generate

### Risk: Conventional Commits not followed

- **Likelihood**: Medium — Not all projects enforce convention
- **Impact**: Medium — Version detection inaccurate
- **Mitigation**: Fall back to patch bump; warn user; allow manual override

---

# Deployment Plan

## Features

### `spx claude` (User-facing)

1. **Feature: Claude Init** — `spx claude init` with GitHub/local source
2. **Feature: Claude Update** — `spx claude update` from configured source
3. **Feature: Claude Status** — `spx claude status` for installation info

### `spx marketplace` (Developer-facing)

4. **Feature: Marketplace Status** — `spx marketplace status` with drift detection
5. **Feature: Marketplace Update** — `spx marketplace update` with JSON generation
6. **Feature: Marketplace Init** — `spx marketplace init` for new projects
7. **Feature: Marketplace Reset** — `spx marketplace reset` for force regeneration
8. **Feature: Marketplace Version** — Conventional Commits-based versioning
9. **Feature: Pre-commit Hook** — Auto-fix and stage integration

## Command Summary

```bash
# User commands
spx claude init                    # Install outcomeeng marketplace
spx claude init --source ~/local   # Install from local path
spx claude update                  # Update from configured source
spx claude status                  # Show installation status

# Developer commands
spx marketplace status             # Show sync state
spx marketplace status --json      # JSON output for tooling
spx marketplace update             # Sync JSON from SKILL.md
spx marketplace reset --force      # Force regenerate all JSON
spx marketplace init               # Initialize new marketplace
spx marketplace version            # Show version based on commits
spx marketplace version major      # Explicit major bump
```

## Success Criteria

- [ ] `spx claude init` installs marketplace in <5s
- [ ] `spx claude update` correctly fetches from configured source
- [ ] `spx marketplace status` correctly detects drift in <500ms for 20 plugins
- [ ] `spx marketplace update` generates valid JSON matching Claude Code schema
- [ ] Version detection correctly identifies feat! as minor bump
- [ ] Pre-commit hook auto-fixes and stages without user intervention
