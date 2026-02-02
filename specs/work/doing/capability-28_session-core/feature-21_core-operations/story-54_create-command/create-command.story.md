# Story: Create Command

## Functional Requirements

### FR1: Create session from stdin content

```gherkin
GIVEN session content piped to stdin
WHEN createSession(content) is called
THEN a new session file is created in todo directory with timestamp ID
```

#### Files created/modified

1. `src/session/create.ts` [new]: Session creation logic

### FR2: Generate unique timestamp-based ID

```gherkin
GIVEN the current time is 2026-01-13T08:01:05
WHEN createSession() is called
THEN the session file is named 2026-01-13_08-01-05.md
```

#### Files created/modified

1. `src/session/create.ts` [modify]: Use timestamp utils

### FR3: Ensure directories exist

```gherkin
GIVEN the configured todo directory does not exist
WHEN createSession() is called
THEN directory is created before writing file
```

> **Note**: The todo directory path is derived from `DEFAULT_CONFIG.sessions`, never hardcoded.

#### Files created/modified

1. `src/session/create.ts` [modify]: Add directory creation

### FR4: Return session ID on success

```gherkin
GIVEN valid session content
WHEN createSession() completes
THEN the generated session ID is returned for confirmation
```

#### Files created/modified

1. `src/session/create.ts` [modify]: Return value

### FR5: Anchor to git repository root

```gherkin
GIVEN user is in a subdirectory of a git repository
AND no --sessions-dir is provided
WHEN createSession() is called
THEN the session directory is created at the git repository root
AND NOT relative to the current working directory
```

#### Files created/modified

1. `src/git/root.ts` [new]: Git root detection with dependency injection
2. `src/commands/session/handoff.ts` [modify]: Use git root for default path resolution

## Testing Strategy

> Use `/testing-typescript` skill to understand testing strategy.

### Level Assignment

| Component          | Level | Justification                             |
| ------------------ | ----- | ----------------------------------------- |
| ID generation      | 1     | Uses timestamp utils (already tested)     |
| Path construction  | 1     | Pure function: config → path              |
| Content validation | 1     | Pure function: string → valid/invalid     |
| Git root detection | 2     | Requires real `git` binary and filesystem |

### When to Escalate

- **Level 1**: Logic for constructing paths and validating content is pure
- **Level 2**: Git root detection requires real `git rev-parse` execution

### Test Harness (Level 2)

| Level | Harness      | Location                        |
| ----- | ------------ | ------------------------------- |
| 2     | `withGitEnv` | `@test/harness/with-git-env.ts` |

## Unit Tests (Level 1)

```typescript
// tests/unit/session/create.test.ts
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { DEFAULT_CONFIG } from "@/config/defaults";
import { buildSessionPath, validateSessionContent } from "@/session/create";
import { DEFAULT_SESSION_CONFIG } from "@/session/show";

describe("buildSessionPath", () => {
  it("GIVEN config from DEFAULT_SESSION_CONFIG and ID WHEN built THEN returns correct path", () => {
    // Given - use actual config, never hardcoded strings
    const config = DEFAULT_SESSION_CONFIG;
    const sessionId = "2026-01-13_08-01-05";

    // When
    const result = buildSessionPath(sessionId, config);

    // Then - derive expected path from config
    const expected = join(config.todoDir, `${sessionId}.md`);
    expect(result).toBe(expected);
  });
});

describe("validateSessionContent", () => {
  it("GIVEN valid markdown WHEN validated THEN returns valid", () => {
    // Given
    const content = `---
id: test
---
# Content`;

    // When
    const result = validateSessionContent(content);

    // Then
    expect(result.valid).toBe(true);
  });

  it("GIVEN empty content WHEN validated THEN returns invalid", () => {
    // Given
    const content = "";

    // When
    const result = validateSessionContent(content);

    // Then
    expect(result.valid).toBe(false);
    expect(result.error).toContain("empty");
  });
});
```

> **Critical**: Tests MUST:
>
> - Import paths from `@/config/defaults` or `@/session/show`
> - Use path aliases (`@/`, `@test/`) instead of deep relative imports
> - Never hardcode path strings like `.spx/sessions/todo`
> - Derive expected values from config constants

## Architectural Requirements

### Relevant ADRs

1. [Timestamp Format](./../../decisions/adr-32_timestamp-format.md) - ID format
2. [Session Directory Structure](./../../decisions/adr-21_session-directory-structure.md) - Where to create, git root anchoring, single source of truth for paths

## Quality Requirements

### QR1: Atomic Creation

**Requirement:** Session creation should be atomic (write to temp, rename)
**Target:** No partial files on failure
**Validation:** Integration tests verify atomicity

## Completion Criteria

- [ ] All Level 1 unit tests pass
- [ ] Session created in todo directory (path derived from `DEFAULT_CONFIG`)
- [ ] ID follows timestamp format specification
- [ ] Missing directories created automatically
- [ ] Sessions created at git root when in a git repository
- [ ] Warning emitted to stderr when not in a git repository
- [ ] No hardcoded path strings in implementation or tests
- [ ] All imports use path aliases (`@/`, `@test/`), not deep relative paths
