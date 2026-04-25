# Story: Fixture Integration

## User Story

AS A test author
I WANT withTestEnv to integrate with the fixture generator
SO THAT I can create full test fixtures with a single declarative option

## Acceptance Criteria

### AC1: Fixture Option

```gherkin
GIVEN fixture option with FixtureConfig
WHEN withTestEnv({ fixture: config }, callback) is called
THEN generates fixture tree via generateFixtureTree()
AND materializes via materializeFixture()
AND passes materialized fixture path to callback
```

### AC2: Preset Support

```gherkin
GIVEN fixture: PRESETS.SHALLOW_50
WHEN withTestEnv({ fixture: PRESETS.SHALLOW_50 }, callback) is called
THEN creates fixture with 50 work items
AND callback receives path to fixture root
```

### AC3: Custom Config Support

```gherkin
GIVEN custom fixture config
WHEN withTestEnv({ fixture: customConfig }, callback) is called
THEN creates fixture matching custom configuration
```

### AC4: Fixture Cleanup

```gherkin
GIVEN fixture created via fixture option
WHEN callback completes (success or failure)
THEN fixture.cleanup() is called
AND all fixture files are removed
```

### AC5: Option Priority

```gherkin
GIVEN both fixture and emptySpecs options
WHEN withTestEnv({ fixture: config, emptySpecs: true }, callback) is called
THEN fixture option takes precedence
AND emptySpecs is ignored
```

## Technical Design

### Extended Interface

```typescript
// tests/helpers/with-test-env.ts

import { type FixtureConfig, generateFixtureTree } from "./fixture-generator";
import { materializeFixture } from "./fixture-writer";

interface TestEnvOptions {
  /** Generate full fixture from config */
  fixture?: FixtureConfig;

  /** Create empty specs/doing structure (ignored if fixture provided) */
  emptySpecs?: boolean;
}
```

### Implementation

```typescript
export async function withTestEnv<T>(
  optionsOrFn: TestEnvOptions | ((ctx: TestEnvContext) => Promise<T>),
  maybeFn?: (ctx: TestEnvContext) => Promise<T>,
): Promise<T> {
  const [options, fn] = typeof optionsOrFn === "function"
    ? [{}, optionsOrFn]
    : [optionsOrFn, maybeFn!];

  // Fixture path: generate and materialize
  if (options.fixture) {
    const tree = generateFixtureTree(options.fixture);
    const fixture = await materializeFixture(tree);
    try {
      return await fn({ path: fixture.path });
    } finally {
      await fixture.cleanup();
    }
  }

  // Bare temp or emptySpecs path
  const tempPath = join(tmpdir(), `spx-test-${randomUUID()}`);
  await mkdir(tempPath, { recursive: true });

  try {
    if (options.emptySpecs) {
      await mkdir(join(tempPath, "specs", "doing"), { recursive: true });
    }
    return await fn({ path: tempPath });
  } finally {
    try {
      await rm(tempPath, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}
```

### File Location

`tests/helpers/with-test-env.ts` (extends story-21 implementation)

## Testing Strategy

### Level: 2 (Integration)

**Justification**: Must verify integration with fixture generator and real filesystem operations.

### Tests

```typescript
// tests/helpers/with-test-env.integration.test.ts (extends story-21 tests)

import { PRESETS } from "@test/helpers/fixture-generator";

describe("withTestEnv - fixture integration", () => {
  describe("fixture option", () => {
    it("GIVEN MINIMAL preset WHEN called THEN creates fixture structure", async () => {
      await withTestEnv({ fixture: PRESETS.MINIMAL }, async ({ path }) => {
        // Verify fixture structure exists
        expect(existsSync(join(path, "specs", "doing"))).toBe(true);

        // Verify at least one capability directory exists
        const doingContents = readdirSync(join(path, "specs", "doing"));
        expect(doingContents.some(d => d.startsWith("capability-"))).toBe(true);
      });
    });

    it("GIVEN SHALLOW_50 preset WHEN called THEN creates 50 work items", async () => {
      await withTestEnv({ fixture: PRESETS.SHALLOW_50 }, async ({ path }) => {
        // Run spx status to verify item count
        const { stdout } = await execa("node", [CLI_PATH, "status", "--json"], {
          cwd: path,
        });
        const result = JSON.parse(stdout);
        const total = result.summary.done + result.summary.inProgress
          + result.summary.open;
        expect(total).toBeGreaterThanOrEqual(10); // At least capabilities + features
      });
    });

    it("GIVEN custom config WHEN called THEN creates matching fixture", async () => {
      const customConfig = {
        capabilities: 2,
        featuresPerCapability: 2,
        storiesPerFeature: 1,
        statusDistribution: { done: 1, inProgress: 0, open: 0 },
      };

      await withTestEnv({ fixture: customConfig }, async ({ path }) => {
        const doingContents = readdirSync(join(path, "specs", "doing"));
        const caps = doingContents.filter(d => d.startsWith("capability-"));
        expect(caps.length).toBe(2);
      });
    });
  });

  describe("fixture cleanup", () => {
    it("GIVEN fixture WHEN callback completes THEN fixture is cleaned up", async () => {
      let capturedPath: string | undefined;

      await withTestEnv({ fixture: PRESETS.MINIMAL }, async ({ path }) => {
        capturedPath = path;
      });

      expect(existsSync(capturedPath!)).toBe(false);
    });

    it("GIVEN fixture WHEN callback throws THEN fixture is still cleaned up", async () => {
      let capturedPath: string | undefined;

      await expect(
        withTestEnv({ fixture: PRESETS.MINIMAL }, async ({ path }) => {
          capturedPath = path;
          throw new Error("test error");
        }),
      ).rejects.toThrow("test error");

      expect(existsSync(capturedPath!)).toBe(false);
    });
  });

  describe("option priority", () => {
    it("GIVEN both fixture and emptySpecs WHEN called THEN fixture takes precedence", async () => {
      await withTestEnv(
        { fixture: PRESETS.MINIMAL, emptySpecs: true },
        async ({ path }) => {
          // Should have full fixture structure, not just empty specs
          const doingContents = readdirSync(join(path, "specs", "doing"));
          expect(doingContents.some(d => d.startsWith("capability-"))).toBe(
            true,
          );
        },
      );
    });
  });
});
```

## Dependencies

- **story-21_context-manager**: Base `withTestEnv()` implementation
- **ADR-003**: `generateFixtureTree()`, `materializeFixture()`, `PRESETS`

## Definition of Done

- [ ] `fixture` option added to `TestEnvOptions`
- [ ] Integration with `generateFixtureTree()` working
- [ ] Integration with `materializeFixture()` working
- [ ] Fixture cleanup via `fixture.cleanup()` verified
- [ ] Preset support tested (MINIMAL, SHALLOW_50, etc.)
- [ ] Custom config support tested
- [ ] Option priority (fixture > emptySpecs) tested
- [ ] All integration tests passing
