# Capability: Claude Marketplace Management

## Success Metric

**Quantitative Target:**

- **Baseline**: Manual marketplace install/update; manual JSON maintenance takes 5-10 minutes per release
- **Target**: One-command install/update for users; zero-touch JSON sync for developers
- **Measurement**: `spx claude init` completes in <5s; pre-commit hook <500ms; 100% drift detection

## Testing Strategy

> Use `/testing-typescript` skill to understand testing strategy.

### Level Assignment

| Component                | Level | Justification                                        |
| ------------------------ | ----- | ---------------------------------------------------- |
| SKILL.md extraction      | 1     | Pure parsing functions, regex operations             |
| Version calculation      | 1     | Pure logic from commit type to version bump          |
| Directory scanning       | 1     | FS operations with `os.tmpdir()` (standard tools)    |
| Git commit analysis      | 1     | Git is always available (standard developer tool)    |
| JSON generation          | 1     | FS operations for reading/writing with temp fixtures |
| Pre-commit hook          | 1     | Git available; FS and git ops with temp fixtures     |
| Claude Code config read  | 2     | Requires external Claude Code configuration          |
| Full marketplace install | 3     | Complete user workflow with Claude Code              |
| Full marketplace sync    | 3     | Complete developer workflow with real plugins        |

### Escalation Rationale

- **1 → 2**: Unit tests with real FS and git operations prove core functionality, but Level 2 verifies integration with external Claude Code configuration
- **2 → 3**: Integration tests prove Claude Code integration works, but Level 3 verifies complete workflows with external dependencies (GitHub repos, network calls)

## Capability E2E Tests (Level 3)

These tests verify the **complete user journey** delivers value.

### E2E1: User Installs Marketplace

```typescript
// test/e2e/claude-marketplace.e2e.test.ts
describe("Capability: Claude Marketplace - User", () => {
  it("GIVEN no marketplace installed WHEN running spx claude init THEN marketplace is available", async () => {
    // Given: Clean Claude Code environment
    const tempHome = await createTempHome();

    // When: Install marketplace
    const startTime = Date.now();
    const { exitCode } = await execa("spx", ["claude", "init"], {
      env: { HOME: tempHome },
    });
    const elapsed = Date.now() - startTime;

    // Then: Marketplace installed and usable
    expect(exitCode).toBe(0);
    expect(elapsed).toBeLessThan(5000); // < 5s
    expect(
      await exists(
        path.join(
          tempHome,
          ".claude/plugins/cache/outcomeeng/marketplace.json",
        ),
      ),
    ).toBe(true);
  });
});
```

### E2E2: Developer Syncs Marketplace

```typescript
describe("Capability: Claude Marketplace - Developer", () => {
  it("GIVEN marketplace with drift WHEN running spx marketplace update THEN JSON matches SKILL.md", async () => {
    // Given: Marketplace fixture with modified SKILL.md but stale JSON
    const fixtureRoot = await createGitFixture("marketplace-with-drift");

    // When: Execute full sync workflow
    const startTime = Date.now();
    const { exitCode } = await execa("spx", ["marketplace", "update"], {
      cwd: fixtureRoot,
    });
    const elapsed = Date.now() - startTime;

    // Then: Sync completes and JSON is accurate
    expect(exitCode).toBe(0);
    expect(elapsed).toBeLessThan(2000); // < 2s for fixture

    // Verify JSON matches SKILL.md content
    const pluginJson = await readJson(
      path.join(fixtureRoot, "plugins/typescript/.claude-plugin/plugin.json"),
    );
    const skillMd = await readFile(
      path.join(fixtureRoot, "plugins/typescript/skills/testing/SKILL.md"),
    );

    expect(pluginJson.skills[0].description).toContain(
      extractFirstParagraph(skillMd),
    );
  });
});
```

### E2E3: Pre-commit Auto-fix Workflow

```typescript
describe("Capability: Claude Marketplace - Pre-commit", () => {
  it("GIVEN staged SKILL.md change WHEN pre-commit runs THEN JSON is auto-fixed and staged", async () => {
    // Given: Fixture with pre-commit hook configured
    const fixtureRoot = await createGitFixture("marketplace-with-hooks");

    // Modify SKILL.md and stage it
    await modifyFile(
      path.join(fixtureRoot, "plugins/typescript/skills/testing/SKILL.md"),
      "Updated description",
    );
    await execa("git", ["add", "plugins/"], { cwd: fixtureRoot });

    // When: Run pre-commit hook
    const startTime = Date.now();
    const { exitCode } = await execa("lefthook", ["run", "pre-commit"], {
      cwd: fixtureRoot,
    });
    const elapsed = Date.now() - startTime;

    // Then: Hook passes quickly and JSON is staged
    expect(exitCode).toBe(0);
    expect(elapsed).toBeLessThan(500); // < 500ms

    const stagedFiles = await execa(
      "git",
      ["diff", "--cached", "--name-only"],
      {
        cwd: fixtureRoot,
      },
    );
    expect(stagedFiles.stdout).toContain("plugin.json");
  });
});
```

## System Integration

This capability provides two command namespaces in spx-cli:

| Namespace         | Audience   | Purpose                                     |
| ----------------- | ---------- | ------------------------------------------- |
| `spx claude`      | Users      | Install/update marketplace in Claude Code   |
| `spx marketplace` | Developers | Maintain JSON files, versioning, pre-commit |

Integrates with:

- **Capability 21 (Core CLI)**: Reuses scanner patterns and CLI infrastructure
- **Git**: Conventional Commits analysis for versioning
- **Claude Code**: Config reading for source discovery
- **Pre-commit hooks**: lefthook/husky integration

## Completion Criteria

- [ ] All Level 1 tests pass (via story completion)
- [ ] All Level 2 tests pass (via feature completion)
- [ ] All Level 3 E2E tests pass
- [ ] Success metrics achieved:
  - [ ] `spx claude init` < 5s
  - [ ] Pre-commit hook < 500ms
  - [ ] 100% drift detection accuracy
- [ ] All ADRs implemented (001-004)
- [ ] Pre-commit hook integration documented

**Note**: To see current features in this capability, use `ls` or `find` to list feature directories (e.g., `feature-*`) within this capability's folder.
