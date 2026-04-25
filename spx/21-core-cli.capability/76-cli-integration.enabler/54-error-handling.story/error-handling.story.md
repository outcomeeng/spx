# Story: Error Handling

## Functional Requirements

### FR1: Handle invalid commands gracefully

```gherkin
GIVEN invalid command
WHEN running spx
THEN show help message and exit with code 1
```

#### Files created/modified

1. `src/cli.ts` [modify]: Add error handling for unknown commands

### FR2: Handle missing specs/ directory

```gherkin
GIVEN directory without specs/
WHEN running spx status
THEN show clear error message
```

#### Files created/modified

1. `src/commands/status.ts` [modify]: Add specs/ directory validation

### FR3: Handle permission errors

```gherkin
GIVEN specs/ directory with permission errors
WHEN running spx status
THEN show descriptive error with path
```

#### Files created/modified

1. `src/commands/status.ts` [modify]: Add permission error handling

## Testing Strategy

### Level Assignment

| Component             | Level | Justification              |
| --------------------- | ----- | -------------------------- |
| Command validation    | 2     | Requires CLI execution     |
| Error message display | 2     | Requires real stderr       |
| Exit codes            | 2     | Requires real process.exit |

## Integration Tests (Level 2)

```typescript
// test/integration/cli/errors.integration.test.ts
import { execa } from "execa";
import { describe, expect, it } from "vitest";

describe("CLI Error Handling", () => {
  it("GIVEN invalid command WHEN running THEN shows help and exits with 1", async () => {
    const { exitCode, stderr } = await execa(
      "node",
      ["bin/spx.js", "invalid"],
      {
        reject: false,
      },
    );

    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/Unknown command|help/i);
  });

  it("GIVEN no specs dir WHEN running status THEN shows clear error", async () => {
    const { exitCode, stderr } = await execa("node", ["bin/spx.js", "status"], {
      cwd: "test/fixtures/repos/no-specs",
      reject: false,
    });

    expect(exitCode).toBe(1);
    expect(stderr).toContain("specs/");
  });

  it("GIVEN permission error WHEN running status THEN shows descriptive error", async () => {
    const { exitCode, stderr } = await execa("node", ["bin/spx.js", "status"], {
      cwd: "test/fixtures/repos/restricted",
      reject: false,
    });

    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/permission|EACCES/i);
  });
});
```

## Completion Criteria

- [ ] All Level 2 integration tests pass
- [ ] Error messages are helpful
- [ ] Correct exit codes
- [ ] 100% type coverage
