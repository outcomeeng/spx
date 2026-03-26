# Capability: Spec Domain - Evidence-Based Work Item Management

## Success Metric

**Quantitative Target:**

- **Baseline**: 0% test traceability, unknown orphaned tests, boolean DONE.md status, workflow folders
- **Target**: 100% test traceability via evidence.yaml, 0 orphaned tests, flat structure, fully-qualified addressing
- **Measurement**: `spx spec validate` passes with no warnings; every test in `tests/` referenced by exactly one evidence.yaml; all output uses `c15/f21/s99` format

## Testing Strategy

### Level Assignment

| Component             | Level | Justification                                       |
| --------------------- | ----- | --------------------------------------------------- |
| evidence.yaml parsing | 1     | Pure function: YAML → structured data               |
| Address parsing       | 1     | Pure function: string → SpecAddress                 |
| Status determination  | 1     | Pure function: filesystem state → status enum       |
| Validation logic      | 1     | Pure function: evidence + tests → validation result |
| CLI commands          | 2     | Integration: commands interact with real filesystem |
| Pre-commit hook       | 2     | Integration: hook interacts with git                |
| Full workflow         | 3     | E2E: complete user journey from spec to evidence    |

### Escalation Rationale

- **1 → 2**: Level 2 verifies CLI integration with real filesystem and git operations
- **2 → 3**: Level 3 verifies the complete workflow: write spec, write tests, graduate, create evidence, validate

## Capability E2E Tests (Level 3)

These tests verify the **complete user journey** delivers value.

### E2E1: Complete evidence chain from spec to validated IMPLEMENTED

```typescript
// tests/e2e/spec-domain.e2e.test.ts
describe("Capability: Spec Domain Evidence Chain", () => {
  it("GIVEN a completed story WHEN evidence.yaml created THEN validation passes and status is IMPLEMENTED", async () => {
    // Given: A story with implementation and tests (flat structure)
    const productDir = await setupTestProduct();
    const storyPath = "specs/capability-27/feature-21/story-21";

    await createStoryWithTests(productDir, storyPath, {
      specContent: "# Story: Test Evidence\n\nImplement evidence.yaml support.",
      testContent: "test('evidence parsing works', () => expect(true).toBe(true));",
    });

    // When: User graduates tests and creates evidence
    const commitHash = await getCurrentCommitHash(productDir);
    await graduateTests(productDir, storyPath, "tests/unit/spec-domain/");
    await createEvidence(productDir, storyPath, {
      commit: commitHash,
      tests: ["tests/unit/spec-domain/story-21.test.ts"],
    });

    // Then: Status shows IMPLEMENTED with fully-qualified address
    const status = await exec("spx spec status --json", { cwd: productDir });
    const statusData = JSON.parse(status.stdout);
    expect(statusData.items).toContainEqual(
      expect.objectContaining({
        address: "c27/f21/s21",
        status: "IMPLEMENTED",
      }),
    );

    // And: Validation passes
    const validate = await exec("spx spec validate", { cwd: productDir });
    expect(validate.exitCode).toBe(0);
    expect(validate.stdout).not.toContain("orphan");
    expect(validate.stdout).not.toContain("missing");
  });
});
```

### E2E2: Orphan detection and remediation guidance

```typescript
describe("Capability: Spec Domain Validation", () => {
  it("GIVEN orphaned tests WHEN validate runs THEN clear remediation guidance provided", async () => {
    // Given: Tests exist without evidence
    const productDir = await setupTestProduct();
    await fs.mkdir(path.join(productDir, "tests/unit"), { recursive: true });
    await fs.writeFile(
      path.join(productDir, "tests/unit/orphaned.test.ts"),
      "test('orphan', () => {})",
    );

    // When: Validation runs
    const validate = await exec("spx spec validate", { cwd: productDir });

    // Then: Orphan detected with remediation
    expect(validate.exitCode).toBe(1);
    expect(validate.stdout).toContain("orphaned.test.ts");
    expect(validate.stdout).toMatch(/delete|add to evidence/i);
  });
});
```

### E2E3: Fully-qualified addressing in output

```typescript
describe("Capability: Spec Domain Addressing", () => {
  it("GIVEN specs exist WHEN next command runs THEN returns fully-qualified address", async () => {
    // Given: A spec tree with mixed status
    const productDir = await setupTestProduct();
    await createSpec(productDir, "specs/capability-15/feature-21/story-43", {
      status: "OPEN",
    });

    // When: Next command runs
    const next = await exec("spx spec next", { cwd: productDir });

    // Then: Returns fully-qualified address
    expect(next.exitCode).toBe(0);
    expect(next.stdout.trim()).toBe("c15/f21/s43");
  });

  it("GIVEN lenient input WHEN status command runs THEN resolves address correctly", async () => {
    // Given: Various input formats
    const inputs = [
      "c15/f21/s43",
      "15/21/43",
      "capability-15/feature-21/story-43",
      "capability-15_foo/feature-21_bar/story-43_baz",
    ];

    // When/Then: All resolve to same spec
    for (const input of inputs) {
      const status = await exec(`spx spec status ${input}`, { cwd: productDir });
      expect(status.exitCode).toBe(0);
      expect(status.stdout).toContain("c15/f21/s43");
    }
  });
});
```

## System Integration

This capability integrates with:

- **spec status**: Uses evidence.yaml for IMPLEMENTED determination instead of DONE.md
- **spec next**: Returns fully-qualified address (c15/f21/s99), uses BSP ordering
- **spec validate**: New command checking evidence chain integrity
- **Git hooks**: Pre-commit hook prevents spec drift from being committed
- **CI**: Validation should run in CI to catch orphaned tests

## Completion Criteria

- [ ] All Level 1 tests pass (evidence parsing, address parsing, status logic, validation logic)
- [ ] All Level 2 tests pass (CLI commands, hook integration)
- [ ] All Level 3 E2E tests pass (full workflow validation)
- [ ] Success metric achieved: 100% test traceability, 0 orphans
- [ ] Flat structure supported (no work/ folder)
- [ ] Fully-qualified addressing (c15/f21/s99) in all output
- [ ] Lenient input parsing accepts multiple address formats
- [ ] Migration guide from DONE.md and work/ folder documented
- [ ] Pre-commit hook installable via `spx setup`

**Note**: To see current features in this capability, use `ls` or `find` to list feature directories (e.g., `feature-*`) within this capability's folder.
