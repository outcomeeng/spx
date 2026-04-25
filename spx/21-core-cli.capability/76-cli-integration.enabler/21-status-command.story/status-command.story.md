# Story: Status Command

## Functional Requirements

### FR1: Implement `spx status` command

```gherkin
GIVEN spx CLI
WHEN running `spx status`
THEN output project status in text format
```

#### Files created/modified

1. `src/cli.ts` [modify]: Add status command handler
2. `src/commands/status.ts` [new]: Implement status command logic

### FR2: Wire all components together

```gherkin
GIVEN status command
WHEN executing
THEN walk dirs → determine status → build tree → format output
```

#### Files created/modified

1. `src/commands/status.ts` [modify]: Orchestrate all features

## Testing Strategy

### Level Assignment

| Component        | Level | Justification                |
| ---------------- | ----- | ---------------------------- |
| Command routing  | 2     | Requires Commander.js        |
| Component wiring | 2     | Integration of all features  |
| Stdout handling  | 2     | Requires real process.stdout |

## Integration Tests (Level 2)

```typescript
// test/integration/cli/status.integration.test.ts
import { execa } from "execa";
import { describe, expect, it } from "vitest";

describe("spx status command", () => {
  it("GIVEN fixture repo WHEN running status THEN outputs tree", async () => {
    const { stdout, exitCode } = await execa("node", ["bin/spx.js", "status"], {
      cwd: "test/fixtures/repos/simple",
    });

    expect(exitCode).toBe(0);
    expect(stdout).toContain("capability-");
    expect(stdout).toContain("feature-");
  });

  it("GIVEN empty repo WHEN running status THEN shows no work items", async () => {
    const { stdout, exitCode } = await execa("node", ["bin/spx.js", "status"], {
      cwd: "test/fixtures/repos/empty",
    });

    expect(exitCode).toBe(0);
    expect(stdout).toContain("No work items found");
  });
});
```

## Completion Criteria

- [ ] All Level 2 integration tests pass
- [ ] Status command works end-to-end
- [ ] All features wired together
- [ ] 100% type coverage
