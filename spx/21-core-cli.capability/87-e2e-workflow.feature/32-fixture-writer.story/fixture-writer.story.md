# Story: Fixture Writer

## Functional Requirements

### FR1: Implement `materializeFixture(tree)`

```gherkin
GIVEN a FixtureTree from generateFixtureTree()
WHEN calling materializeFixture(tree)
THEN create directory structure in os.tmpdir() and return MaterializedFixture
```

Creates actual filesystem structure matching `specs/templates/structure.yaml`.

#### Files created/modified

1. `tests/helpers/fixture-writer.ts` [new]: Implement fixture materialization

### FR2: Implement cleanup function

```gherkin
GIVEN a MaterializedFixture
WHEN calling cleanup()
THEN remove all created directories and files
```

#### Files created/modified

1. `tests/helpers/fixture-writer.ts` [modify]: Add cleanup handling

### FR3: Implement convenience wrapper `createFixture(config)`

```gherkin
GIVEN a FixtureConfig
WHEN calling createFixture(config)
THEN generate tree and materialize in one call
```

#### Files created/modified

1. `tests/helpers/fixture-generator.ts` [modify]: Add createFixture export

## Architectural Requirements

### Relevant ADRs

1. **ADR-003: E2E Fixture Generation Strategy** - Defines materialization approach
2. **specs/templates/structure.yaml** - Defines valid file structure

### Types

```typescript
interface MaterializedFixture {
  path: string; // Absolute path to fixture root
  cleanup: () => Promise<void>; // Removes fixture directory
  config: FixtureConfig; // Original config for reference
}

// Convenience wrapper
async function createFixture(
  config: FixtureConfig,
): Promise<MaterializedFixture>;
```

### Generated Structure

Per `specs/templates/structure.yaml`, only valid files are created:

```
{tmpdir}/spx-fixture-{uuid}/
└── specs/
    └── doing/
        └── capability-{NN}_{slug}/
            ├── {slug}.capability.md
            ├── decisions/
            │   └── adr-001_{slug}.md
            └── feature-{NN}_{slug}/
                ├── {slug}.feature.md
                └── story-{NN}_{slug}/
                    ├── {slug}.story.md
                    └── tests/
                        ├── DONE.md          # If DONE
                        ├── test.test.ts     # If IN_PROGRESS
                        └── (empty)          # If OPEN
```

## Testing Strategy

### Level Assignment

| Component          | Level | Justification                             |
| ------------------ | ----- | ----------------------------------------- |
| Directory creation | 2     | Real filesystem I/O in tmpdir             |
| File writing       | 2     | Actual file contents                      |
| Cleanup            | 2     | Must verify deletion                      |
| Structure validity | 2     | Must match specs/templates/structure.yaml |

### When to Escalate

This story uses Level 2 because:

- Must verify actual files exist on disk
- Tests cleanup properly removes all artifacts
- Validates against real filesystem behavior

## Integration Tests (Level 2)

```typescript
// tests/integration/helpers/fixture-writer.test.ts
import { generateFixtureTree, PRESETS } from "@/tests/helpers/fixture-generator";
import { materializeFixture } from "@/tests/helpers/fixture-writer";
import { existsSync, readdirSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";

describe("materializeFixture", () => {
  const fixtures: Array<{ cleanup: () => Promise<void> }> = [];

  afterEach(async () => {
    for (const f of fixtures) {
      await f.cleanup();
    }
    fixtures.length = 0;
  });

  it("GIVEN tree WHEN materializing THEN creates directory in tmpdir", async () => {
    const tree = generateFixtureTree(PRESETS.MINIMAL);
    const fixture = await materializeFixture(tree);
    fixtures.push(fixture);

    expect(fixture.path).toContain("spx-fixture-");
    expect(existsSync(fixture.path)).toBe(true);
  });

  it("GIVEN tree WHEN materializing THEN creates specs/doing structure", async () => {
    const tree = generateFixtureTree(PRESETS.MINIMAL);
    const fixture = await materializeFixture(tree);
    fixtures.push(fixture);

    expect(existsSync(`${fixture.path}/specs/doing`)).toBe(true);
  });

  it("GIVEN tree with capability WHEN materializing THEN creates capability.md", async () => {
    const tree = generateFixtureTree(PRESETS.MINIMAL);
    const fixture = await materializeFixture(tree);
    fixtures.push(fixture);

    const doing = `${fixture.path}/specs/doing`;
    const caps = readdirSync(doing).filter((d) => d.startsWith("capability-"));
    expect(caps.length).toBe(1);

    const capDir = `${doing}/${caps[0]}`;
    const slug = caps[0].split("_")[1];
    expect(existsSync(`${capDir}/${slug}.capability.md`)).toBe(true);
  });

  it("GIVEN DONE story WHEN materializing THEN creates tests/DONE.md", async () => {
    const tree = generateFixtureTree({
      ...PRESETS.MINIMAL,
      statusDistribution: { done: 1, inProgress: 0, open: 0 },
    });
    const fixture = await materializeFixture(tree);
    fixtures.push(fixture);

    // Find the story's tests directory
    const storyTests = findStoryTestsDir(fixture.path);
    expect(existsSync(`${storyTests}/DONE.md`)).toBe(true);
  });

  it("GIVEN IN_PROGRESS story WHEN materializing THEN creates tests/*.test.ts", async () => {
    const tree = generateFixtureTree({
      ...PRESETS.MINIMAL,
      statusDistribution: { done: 0, inProgress: 1, open: 0 },
    });
    const fixture = await materializeFixture(tree);
    fixtures.push(fixture);

    const storyTests = findStoryTestsDir(fixture.path);
    const files = readdirSync(storyTests);
    expect(files.some((f) => f.endsWith(".test.ts"))).toBe(true);
    expect(files.includes("DONE.md")).toBe(false);
  });

  it("GIVEN OPEN story WHEN materializing THEN creates empty tests/", async () => {
    const tree = generateFixtureTree({
      ...PRESETS.MINIMAL,
      statusDistribution: { done: 0, inProgress: 0, open: 1 },
    });
    const fixture = await materializeFixture(tree);
    fixtures.push(fixture);

    const storyTests = findStoryTestsDir(fixture.path);
    expect(existsSync(storyTests)).toBe(true);
    expect(readdirSync(storyTests).length).toBe(0);
  });

  it("GIVEN fixture WHEN cleanup called THEN removes all files", async () => {
    const tree = generateFixtureTree(PRESETS.MINIMAL);
    const fixture = await materializeFixture(tree);
    const path = fixture.path;

    expect(existsSync(path)).toBe(true);
    await fixture.cleanup();
    expect(existsSync(path)).toBe(false);
  });

  it("GIVEN adrsPerCapability WHEN materializing THEN creates ADR files", async () => {
    const tree = generateFixtureTree({
      ...PRESETS.MINIMAL,
      adrsPerCapability: 2,
    });
    const fixture = await materializeFixture(tree);
    fixtures.push(fixture);

    const capDir = findCapabilityDir(fixture.path);
    const decisions = `${capDir}/decisions`;
    expect(existsSync(decisions)).toBe(true);

    const adrs = readdirSync(decisions).filter((f) => f.startsWith("adr-"));
    expect(adrs.length).toBe(2);
  });
});

describe("createFixture", () => {
  it("GIVEN config WHEN calling createFixture THEN generates and materializes", async () => {
    const fixture = await createFixture(PRESETS.MINIMAL);

    try {
      expect(fixture.path).toBeDefined();
      expect(existsSync(fixture.path)).toBe(true);
      expect(fixture.config).toEqual(PRESETS.MINIMAL);
    } finally {
      await fixture.cleanup();
    }
  });
});
```

## Completion Criteria

- [ ] `materializeFixture(tree)` implemented
- [ ] `cleanup()` reliably removes all files
- [ ] `createFixture(config)` convenience wrapper
- [ ] Generated structure matches `specs/templates/structure.yaml`
- [ ] Only valid files created (no noise)
- [ ] All Level 2 tests pass
- [ ] Fixtures created in `os.tmpdir()` only
