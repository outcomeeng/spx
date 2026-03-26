# Capability: Claude Code Settings Management

## Success Metric

**Quantitative Target:**

- **Baseline**: Manual marketplace install requires knowing GitHub URL and manual clone; permission re-approval across 20+ projects wastes ~5 minutes per new project
- **Target**: One-command marketplace install/update; one-command consolidation of all permissions across all projects
- **Measurement**: `spx claude init` completes in <5s; `spx claude settings consolidate` processes 20 projects in <2s; zero duplicate permissions after consolidation

## Testing Strategy

> Use `/testing-typescript` skill to understand testing strategy.

### Level Assignment

| Component                       | Level | Justification                                                                  |
| ------------------------------- | ----- | ------------------------------------------------------------------------------ |
| Permission parsing/merging      | 1     | Pure functions operating on data structures                                    |
| Conflict resolution logic       | 1     | Pure logic: given allow/deny sets, prefer deny                                 |
| Settings file discovery         | 1     | FS operations with `os.tmpdir()` fixtures (standard tools)                     |
| Settings JSON read/write        | 1     | FS operations with temp fixtures (standard tools)                              |
| Backup creation                 | 1     | FS operations with temp fixtures (standard tools)                              |
| Git clone/pull operations       | 1     | Git is always available (standard developer tool)                              |
| Claude Code path detection      | 2     | Requires external Claude Code configuration in ~/.claude/                      |
| Marketplace installation        | 2     | Integrates with Claude Code config to register plugin                          |
| Settings consolidation workflow | 2     | Integrates with real Claude Code settings structure across multiple projects   |
| Complete marketplace install    | 3     | Full user workflow: GitHub clone + Claude Code registration + verification     |
| Complete consolidation workflow | 3     | Full user workflow: discover 20+ projects + merge + backup + write + reporting |

### Escalation Rationale

- **1 → 2**: Unit tests with real FS and git operations prove core functionality, but Level 2 verifies integration with external Claude Code configuration structure and path conventions
- **2 → 3**: Integration tests prove individual operations work with Claude Code, but Level 3 verifies complete end-to-end workflows with real project structures and network operations (GitHub)

## Capability E2E Tests (Level 3)

These tests verify the **complete user journey** delivers value.

### E2E1: User Installs Marketplace from GitHub

```typescript
// tests/e2e/claude-settings.e2e.test.ts
describe("Capability: Claude Settings - Marketplace Install", () => {
  it("GIVEN no marketplace installed WHEN running spx claude init THEN marketplace is available in <5s", async () => {
    // Given: Clean Claude Code environment
    const tempHome = await createTempHome();

    // When: Install marketplace from GitHub (default)
    const startTime = Date.now();
    const { exitCode, stdout } = await execa("spx", ["claude", "init"], {
      env: { HOME: tempHome },
    });
    const elapsed = Date.now() - startTime;

    // Then: Marketplace installed quickly and correctly
    expect(exitCode).toBe(0);
    expect(elapsed).toBeLessThan(5000); // < 5s
    expect(stdout).toContain("Marketplace installed");

    // Verify marketplace files exist
    const marketplacePath = path.join(
      tempHome,
      ".claude/plugins/cache/outcomeeng",
    );
    expect(await exists(marketplacePath)).toBe(true);
    expect(
      await exists(path.join(marketplacePath, "marketplace.json")),
    ).toBe(true);

    // Verify marketplace registered in Claude Code config
    const claudeSettings = await readJson(
      path.join(tempHome, ".claude/settings.json"),
    );
    expect(claudeSettings.plugins).toBeDefined();
  });
});
```

### E2E2: User Consolidates Permissions Across 20 Projects

```typescript
describe("Capability: Claude Settings - Permission Consolidation", () => {
  it("GIVEN 20 projects with local permissions WHEN running spx claude settings consolidate THEN all permissions merged in <2s", async () => {
    // Given: 20 projects with various permissions
    const tempHome = await createTempHome();
    const projectsRoot = path.join(tempHome, "Code");

    await createMultiProjectFixture(projectsRoot, 20, {
      commonPermissions: ["Bash(git:*)", "Bash(npm:*)"],
      uniquePermissionsPerProject: 3,
      conflictingPermissions: ["Bash(docker:*)"], // Some allow, some deny
    });

    // When: Run consolidation
    const startTime = Date.now();
    const { exitCode, stdout } = await execa("spx", [
      "claude",
      "settings",
      "consolidate",
      "--root",
      projectsRoot,
    ], {
      env: { HOME: tempHome },
    });
    const elapsed = Date.now() - startTime;

    // Then: Consolidation completes quickly
    expect(exitCode).toBe(0);
    expect(elapsed).toBeLessThan(2000); // < 2s for 20 projects

    // Verify all files scanned
    expect(stdout).toContain("Files scanned: 20");

    // Verify backup created
    expect(stdout).toMatch(/Backup created:.*settings\.json\.backup/);

    // Verify global settings updated
    const globalSettings = await readJson(
      path.join(tempHome, ".claude/settings.json"),
    );

    // Common permissions should appear exactly once
    expect(globalSettings.allow).toContain("Bash(git:*)");
    expect(globalSettings.allow).toContain("Bash(npm:*)");
    expect(
      globalSettings.allow.filter((p: string) => p === "Bash(git:*)").length,
    ).toBe(1);

    // Conflicts resolved (prefer deny)
    expect(stdout).toContain("Conflict detected");
    expect(globalSettings.deny).toContain("Bash(docker:*)");
    expect(globalSettings.allow).not.toContain("Bash(docker:*)");

    // Verify backup exists and is valid
    const backupFiles = await glob(
      path.join(tempHome, ".claude/settings.json.backup.*"),
    );
    expect(backupFiles.length).toBe(1);
  });
});
```

### E2E3: User Updates Marketplace from Local Source

```typescript
describe("Capability: Claude Settings - Marketplace Update", () => {
  it("GIVEN installed marketplace WHEN running spx claude update THEN latest changes pulled", async () => {
    // Given: Marketplace installed from local source
    const tempHome = await createTempHome();
    const localMarketplace = await createLocalMarketplace();

    // Install from local source
    await execa("spx", [
      "claude",
      "init",
      "--source",
      localMarketplace,
    ], {
      env: { HOME: tempHome },
    });

    // Modify local marketplace (simulate new plugin added)
    await addPluginToMarketplace(localMarketplace, "new-plugin");

    // When: Update marketplace
    const { exitCode, stdout } = await execa("spx", ["claude", "update"], {
      env: { HOME: tempHome },
    });

    // Then: Update successful and new plugin available
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Updated");

    // Verify new plugin exists in installed marketplace
    const installedPath = path.join(
      tempHome,
      ".claude/plugins/cache/outcomeeng",
    );
    expect(
      await exists(path.join(installedPath, "plugins/new-plugin")),
    ).toBe(true);
  });
});
```

### E2E4: Dry-Run Mode Prevents Modifications

```typescript
describe("Capability: Claude Settings - Dry Run Safety", () => {
  it("GIVEN permissions to consolidate WHEN running with --dry-run THEN no files modified", async () => {
    // Given: Projects with permissions to consolidate
    const tempHome = await createTempHomeWithSettings({
      allow: ["Bash(ls:*)"],
    });
    const projectsRoot = await createMultiProjectFixture(
      path.join(tempHome, "Code"),
      5,
      {
        commonPermissions: ["Bash(git:*)"],
      },
    );

    // Capture original state
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

    // Then: Preview shown but no modifications
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Bash(git:*)");
    expect(stdout).toContain("Run without --dry-run to apply changes");

    // Verify settings file unchanged
    const currentSettings = await readJson(
      path.join(tempHome, ".claude/settings.json"),
    );
    const currentModTime = (
      await fs.stat(path.join(tempHome, ".claude/settings.json"))
    ).mtimeMs;

    expect(currentSettings).toEqual(originalSettings);
    expect(currentModTime).toBe(originalModTime);

    // Verify no backup created
    const backupFiles = await glob(
      path.join(tempHome, ".claude/settings.json.backup.*"),
    );
    expect(backupFiles.length).toBe(0);
  });
});
```

## System Integration

This capability provides the `spx claude` command namespace for user-facing Claude Code configuration management:

| Command                           | Purpose                                                  |
| --------------------------------- | -------------------------------------------------------- |
| `spx claude init`                 | Install outcomeeng marketplace into Claude Code          |
| `spx claude update`               | Update marketplace from configured source                |
| `spx claude status`               | Show marketplace installation status                     |
| `spx claude settings consolidate` | Consolidate permissions from projects into global config |

Integrates with:

- **Capability 21 (Core CLI)**: Reuses CLI infrastructure and command registration patterns
- **Capability 26 (Scoped CLI)**: Uses domain router for `spx claude` namespace
- **Git**: Clone/pull for marketplace installation from GitHub
- **Claude Code**: Reads/writes `~/.claude/settings.json` and manages `~/.claude/plugins/`
- **File System**: Recursive discovery of `.claude/settings.local.json` files across projects

## Completion Criteria

- [ ] All Level 1 tests pass (via story completion)
- [ ] All Level 2 tests pass (via feature completion)
- [ ] All Level 3 E2E tests pass
- [ ] Success metrics achieved:
  - [ ] `spx claude init` < 5s
  - [ ] `spx claude settings consolidate` < 2s for 20 projects
  - [ ] Zero duplicate permissions after consolidation
- [ ] Marketplace install/update workflow complete and tested
- [ ] Settings consolidation workflow complete and tested
- [ ] Backup safety mechanism verified
- [ ] Dry-run mode prevents all file modifications
- [ ] Conflict resolution (prefer deny) works correctly
- [ ] Documentation complete with examples

**Note**: To see current features in this capability, use `ls` or `find` to list feature directories (e.g., `feature-*`) within this capability's folder.
