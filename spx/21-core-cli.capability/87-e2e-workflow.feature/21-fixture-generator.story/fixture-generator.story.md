# Story: Fixture Generator

## Functional Requirements

### FR1: Implement `generateFixtureTree(config)`

```gherkin
GIVEN a FixtureConfig with capabilities, features, stories counts
WHEN calling generateFixtureTree(config)
THEN return a FixtureTree with faker.js generated names and BSP numbers
```

The function is pure (no I/O) and returns a tree structure ready for materialization.

#### Files created/modified

1. `tests/helpers/fixture-generator.ts` [new]: Implement tree generator

### FR2: Implement `PRESETS` object

```gherkin
GIVEN common fixture configurations needed for testing
WHEN importing PRESETS
THEN provide ready-to-use configs: MINIMAL, SHALLOW_50, DEEP_50, FAN_10_LEVEL_3
```

#### Files created/modified

1. `tests/helpers/fixture-generator.ts` [modify]: Add PRESETS export

### FR3: Support seed for reproducibility

```gherkin
GIVEN a FixtureConfig with seed value
WHEN generating fixture tree
THEN produce identical names for same seed
```

## Architectural Requirements

### Relevant ADRs

1. **ADR-003: E2E Fixture Generation Strategy** - Defines the two-function approach
2. **specs/templates/structure.yaml** - Defines valid file structure for generated fixtures

### Types

```typescript
interface FixtureConfig {
  capabilities: number;
  featuresPerCapability: number;
  storiesPerFeature: number;
  statusDistribution: { done: number; inProgress: number; open: number };
  adrsPerCapability?: number; // Default: 1
  seed?: number; // For reproducibility
}

interface FixtureNode {
  kind: "capability" | "feature" | "story" | "adr";
  number: number;
  slug: string;
  status?: "DONE" | "IN_PROGRESS" | "OPEN";
  children: FixtureNode[];
}

interface FixtureTree {
  nodes: FixtureNode[];
}

const PRESETS: Record<string, FixtureConfig> = {
  MINIMAL: { capabilities: 1, featuresPerCapability: 1, storiesPerFeature: 1, ... },
  SHALLOW_50: { capabilities: 2, featuresPerCapability: 5, storiesPerFeature: 4, ... },
  DEEP_50: { capabilities: 1, featuresPerCapability: 2, storiesPerFeature: 24, ... },
  FAN_10_LEVEL_3: { capabilities: 1, featuresPerCapability: 3, storiesPerFeature: 2, ... },
};
```

## Testing Strategy

### Level Assignment

| Component         | Level | Justification             |
| ----------------- | ----- | ------------------------- |
| Tree generation   | 1     | Pure function, no I/O     |
| BSP numbering     | 1     | Deterministic calculation |
| Status assignment | 1     | Random but seedable       |
| Faker.js naming   | 1     | Seeded randomness         |

### When to Escalate

This story uses Level 1 only because:

- `generateFixtureTree()` is a pure function with no side effects
- All randomness is seedable for reproducibility
- No filesystem or network I/O

## Unit Tests (Level 1)

```typescript
// tests/unit/helpers/fixture-generator.test.ts
import { generateFixtureTree, PRESETS } from "@/tests/helpers/fixture-generator";
import { describe, expect, it } from "vitest";

describe("generateFixtureTree", () => {
  it("GIVEN MINIMAL preset WHEN generating THEN produces 3 nodes", () => {
    const tree = generateFixtureTree(PRESETS.MINIMAL);

    // 1 cap + 1 feat + 1 story = 3
    const count = countNodes(tree);
    expect(count).toBe(3);
  });

  it("GIVEN SHALLOW_50 preset WHEN generating THEN produces ~50 nodes", () => {
    const tree = generateFixtureTree(PRESETS.SHALLOW_50);

    // 2 caps + 10 feats + 40 stories = 52 (close to 50)
    const count = countNodes(tree);
    expect(count).toBeGreaterThanOrEqual(50);
  });

  it("GIVEN same seed WHEN generating twice THEN produces identical trees", () => {
    const config = { ...PRESETS.MINIMAL, seed: 12345 };

    const tree1 = generateFixtureTree(config);
    const tree2 = generateFixtureTree(config);

    expect(tree1.nodes[0].slug).toBe(tree2.nodes[0].slug);
  });

  it("GIVEN statusDistribution WHEN generating THEN approximates distribution", () => {
    const config = {
      ...PRESETS.SHALLOW_50,
      statusDistribution: { done: 0.5, inProgress: 0.3, open: 0.2 },
      seed: 42,
    };

    const tree = generateFixtureTree(config);
    const statuses = collectStatuses(tree);

    // Allow 20% variance
    expect(statuses.done / statuses.total).toBeCloseTo(0.5, 1);
  });

  it("GIVEN config WHEN generating THEN BSP numbers are valid", () => {
    const tree = generateFixtureTree(PRESETS.FAN_10_LEVEL_3);

    for (const cap of tree.nodes) {
      expect(cap.number).toBeGreaterThanOrEqual(10);
      expect(cap.number).toBeLessThanOrEqual(99);

      for (const feat of cap.children.filter((c) => c.kind === "feature")) {
        expect(feat.number).toBeGreaterThanOrEqual(10);
        expect(feat.number).toBeLessThanOrEqual(99);
      }
    }
  });

  it("GIVEN config WHEN generating THEN slugs are valid patterns", () => {
    const tree = generateFixtureTree(PRESETS.MINIMAL);

    for (const cap of tree.nodes) {
      expect(cap.slug).toMatch(/^[a-z][a-z0-9-]*$/);
    }
  });
});

describe("PRESETS", () => {
  it("MINIMAL produces exactly 3 items", () => {
    expect(PRESETS.MINIMAL.capabilities).toBe(1);
    expect(PRESETS.MINIMAL.featuresPerCapability).toBe(1);
    expect(PRESETS.MINIMAL.storiesPerFeature).toBe(1);
  });

  it("SHALLOW_50 produces ~50 items (wide, shallow)", () => {
    const { capabilities: c, featuresPerCapability: f, storiesPerFeature: s } = PRESETS.SHALLOW_50;
    const total = c + c * f + c * f * s;
    expect(total).toBeGreaterThanOrEqual(50);
  });
});
```

## Completion Criteria

- [ ] `generateFixtureTree(config)` implemented
- [ ] `PRESETS` object exported with 4 configurations
- [ ] Seed support for reproducible generation
- [ ] BSP numbers follow `specs/templates/structure.yaml` rules
- [ ] Slugs are valid (lowercase, hyphens, alphanumeric)
- [ ] All Level 1 tests pass
- [ ] faker.js added to devDependencies
