# Story: Format Options

## Functional Requirements

### FR1: Add `--json` flag to status command

```gherkin
GIVEN status command
WHEN running `spx status --json`
THEN output in JSON format instead of text
```

#### Files created/modified

1. `src/cli.ts` [modify]: Add --json option to status command

### FR2: Add `--format` option for explicit format selection

```gherkin
GIVEN status command
WHEN running `spx status --format [text|json|markdown|table]`
THEN output in specified format
```

#### Files created/modified

1. `src/cli.ts` [modify]: Add --format option

## Testing Strategy

### Level Assignment

| Component        | Level | Justification         |
| ---------------- | ----- | --------------------- |
| Option parsing   | 2     | Requires Commander.js |
| Format switching | 2     | Integration test      |

## Integration Tests (Level 2)

```typescript
// test/integration/cli/status.integration.test.ts (continued)
describe("spx status --json", () => {
  it("GIVEN --json flag WHEN running status THEN outputs valid JSON", async () => {
    const { stdout } = await execa("node", ["bin/spx.js", "status", "--json"], {
      cwd: "test/fixtures/repos/simple",
    });

    expect(() => JSON.parse(stdout)).not.toThrow();
  });
});

describe("spx status --format", () => {
  it("GIVEN --format markdown WHEN running status THEN outputs markdown", async () => {
    const { stdout } = await execa("node", [
      "bin/spx.js",
      "status",
      "--format",
      "markdown",
    ], {
      cwd: "test/fixtures/repos/simple",
    });

    expect(stdout).toMatch(/^#/m);
  });

  it("GIVEN --format table WHEN running status THEN outputs table", async () => {
    const { stdout } = await execa("node", [
      "bin/spx.js",
      "status",
      "--format",
      "table",
    ], {
      cwd: "test/fixtures/repos/simple",
    });

    expect(stdout).toMatch(/\|.*\|/);
  });
});
```

## Completion Criteria

- [ ] All Level 2 integration tests pass
- [ ] --json flag works
- [ ] --format option works for all formats
- [ ] 100% type coverage
