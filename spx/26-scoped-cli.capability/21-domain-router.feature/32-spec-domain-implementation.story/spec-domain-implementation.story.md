# Story: Spec Domain Implementation

## Functional Requirements

### FR1: Move existing commands under spec domain

```gherkin
GIVEN current flat command structure
WHEN refactoring to domain-scoped architecture
THEN migrate status and next commands under spec domain
```

#### Files created/modified

1. `src/commands/spec/status.ts` [move]: Move from `src/commands/status.ts`
2. `src/commands/spec/next.ts` [move]: Move from `src/commands/next.ts`
3. `src/commands/spec/index.ts` [new]: Export spec commands

**File moves**:

- `src/commands/status.ts` → `src/commands/spec/status.ts`
- `src/commands/next.ts` → `src/commands/spec/next.ts`

**New barrel export**:

```typescript
// src/commands/spec/index.ts
export { nextCommand } from "./next.js";
export type { NextOptions } from "./next.js";
export { statusCommand } from "./status.js";
export type { OutputFormat, StatusOptions } from "./status.js";
```

### FR2: Implement spec domain registration

```gherkin
GIVEN domain infrastructure from story-21
WHEN implementing spec domain
THEN register status and next commands under spec namespace
```

#### Files created/modified

1. `src/domains/spec/index.ts` [modify]: Implement domain registration (replace stub)

**Implementation**:

```typescript
// src/domains/spec/index.ts
import type { Command } from "commander";
import { nextCommand } from "../../commands/spec/next.js";
import { type OutputFormat, statusCommand } from "../../commands/spec/status.js";
import type { Domain } from "../types.js";

/**
 * Register spec domain commands
 *
 * @param specCmd - Commander.js spec domain command
 */
function registerSpecCommands(specCmd: Command): void {
  // status command
  specCmd
    .command("status")
    .description("Get project status")
    .option("--json", "Output as JSON")
    .option("--format <format>", "Output format (text|json|markdown|table)")
    .action(async (options: { json?: boolean; format?: string }) => {
      try {
        // Determine format: --json flag overrides --format option
        let format: OutputFormat = "text";
        if (options.json) {
          format = "json";
        } else if (options.format) {
          const validFormats = ["text", "json", "markdown", "table"];
          if (validFormats.includes(options.format)) {
            format = options.format as OutputFormat;
          } else {
            console.error(
              `Error: Invalid format "${options.format}". Must be one of: ${validFormats.join(", ")}`,
            );
            process.exit(1);
          }
        }

        const output = await statusCommand({ cwd: process.cwd(), format });
        console.log(output);
      } catch (error) {
        console.error(
          "Error:",
          error instanceof Error ? error.message : String(error),
        );
        process.exit(1);
      }
    });

  // next command
  specCmd
    .command("next")
    .description("Find next work item to work on")
    .action(async () => {
      try {
        const output = await nextCommand({ cwd: process.cwd() });
        console.log(output);
      } catch (error) {
        console.error(
          "Error:",
          error instanceof Error ? error.message : String(error),
        );
        process.exit(1);
      }
    });
}

/**
 * Spec domain - Manage spec workflow
 */
export const specDomain: Domain = {
  name: "spec",
  description: "Manage spec workflow",
  register: (program: Command) => {
    const specCmd = program
      .command("spec")
      .description("Manage spec workflow");

    registerSpecCommands(specCmd);
  },
};
```

### FR3: Update CLI to use domain router

```gherkin
GIVEN spec domain implementation
WHEN wiring into main CLI
THEN register spec domain instead of flat commands
```

#### Files created/modified

1. `src/cli.ts` [modify]: Register spec domain instead of flat commands

**Updated implementation**:

```typescript
// src/cli.ts
/**
 * CLI entry point for spx
 */
import { Command } from "commander";
import { specDomain } from "./domains/spec/index.js";

const program = new Command();

program
  .name("spx")
  .description("Fast, deterministic CLI tool for spec workflow management")
  .version("0.2.0"); // Bump version for domain-scoped architecture

// Register spec domain
specDomain.register(program);

program.parse();
```

## Testing Strategy

### Level Assignment

| Component                    | Level | Justification                                          |
| ---------------------------- | ----- | ------------------------------------------------------ |
| Command file moves           | 1     | No logic changes, just file location                   |
| Domain registration function | 2     | Requires Commander.js to verify nested command parsing |
| CLI integration              | 2     | Requires real CLI execution to verify routing          |

### Escalation Rationale

**1 → 2**: Must verify Commander.js correctly:

- Parses `spx spec status` syntax
- Routes to correct command handler
- Passes options through nested command structure
- Handles errors appropriately

## Integration Tests (Level 2)

```typescript
// specs/doing/capability-26_scoped-cli/feature-21_domain-router/story-32_spec-domain-implementation/tests/spec-domain.integration.test.ts
import { createFixtureTree, FIXTURE_PRESETS } from "@/tests/fixtures/factories";
import { execa } from "execa";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";

describe("Spec Domain Integration", () => {
  describe("status command", () => {
    it("GIVEN fixture repo WHEN running spec status THEN outputs tree", async () => {
      const tempDir = await mkdtemp(join(tmpdir(), "spx-test-"));
      await createFixtureTree({
        root: tempDir,
        capabilities: [
          { number: 20, slug: "core-cli", status: "DONE" },
          { number: 32, slug: "mcp-server", status: "OPEN" },
        ],
      });

      try {
        const { stdout, exitCode } = await execa("node", [
          "bin/spx.js",
          "spec",
          "status",
        ], {
          cwd: tempDir,
        });

        expect(exitCode).toBe(0);
        expect(stdout).toContain("capability-21_core-cli");
        expect(stdout).toContain("[DONE]");
        expect(stdout).toContain("capability-32_mcp-server");
        expect(stdout).toContain("[OPEN]");
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    });

    it("GIVEN fixture repo WHEN running spec status --json THEN outputs valid JSON", async () => {
      const tempDir = await mkdtemp(join(tmpdir(), "spx-test-"));
      await createFixtureTree({
        root: tempDir,
        capabilities: [{ number: 20, slug: "core-cli", status: "DONE" }],
      });

      try {
        const { stdout, exitCode } = await execa("node", [
          "bin/spx.js",
          "spec",
          "status",
          "--json",
        ], {
          cwd: tempDir,
        });

        expect(exitCode).toBe(0);

        // Verify valid JSON
        const result = JSON.parse(stdout);
        expect(result).toHaveProperty("capabilities");
        expect(result).toHaveProperty("summary");
        expect(result.summary).toHaveProperty("done");
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    });

    it("GIVEN empty repo WHEN running spec status THEN shows no work items", async () => {
      const tempDir = await mkdtemp(join(tmpdir(), "spx-test-"));

      try {
        const { stdout, exitCode } = await execa("node", [
          "bin/spx.js",
          "spec",
          "status",
        ], {
          cwd: tempDir,
        });

        expect(exitCode).toBe(0);
        expect(stdout).toContain("No work items found");
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe("next command", () => {
    it("GIVEN fixture repo WHEN running spec next THEN finds next work item", async () => {
      const tempDir = await mkdtemp(join(tmpdir(), "spx-test-"));
      await createFixtureTree({
        root: tempDir,
        capabilities: [
          { number: 20, slug: "core-cli", status: "DONE" },
          { number: 32, slug: "mcp-server", status: "OPEN" },
        ],
      });

      try {
        const { stdout, exitCode } = await execa("node", [
          "bin/spx.js",
          "spec",
          "next",
        ], {
          cwd: tempDir,
        });

        expect(exitCode).toBe(0);
        expect(stdout).toContain("Next work item:");
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe("help text", () => {
    it("GIVEN spec domain WHEN requesting help THEN shows spec commands", async () => {
      const { stdout, exitCode } = await execa("node", [
        "bin/spx.js",
        "spec",
        "--help",
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("status");
      expect(stdout).toContain("Get project status");
      expect(stdout).toContain("next");
      expect(stdout).toContain("Find next work item");
    });
  });

  describe("error handling", () => {
    it("GIVEN invalid format WHEN running spec status THEN shows error", async () => {
      const tempDir = await mkdtemp(join(tmpdir(), "spx-test-"));

      try {
        const { stderr, exitCode } = await execa(
          "node",
          ["bin/spx.js", "spec", "status", "--format", "invalid"],
          {
            cwd: tempDir,
            reject: false,
          },
        );

        expect(exitCode).toBe(1);
        expect(stderr).toContain("Invalid format");
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    });
  });
});
```

## Completion Criteria

- [ ] All Level 2 integration tests pass
- [ ] Commands moved to `src/commands/spec/` directory
- [ ] Spec domain implementation complete in `src/domains/spec/index.ts`
- [ ] CLI updated to use domain router in `src/cli.ts`
- [ ] `spx spec status` works identically to old `spx status`
- [ ] `spx spec next` works identically to old `spx next`
- [ ] All options work (--json, --format, etc.)
- [ ] Help text shows spec commands
- [ ] Error handling works correctly
- [ ] 100% type coverage

## Implementation Notes

### Why Level 2?

This story requires **Commander.js integration testing** because:

- Must verify nested command parsing (`spx spec status`)
- Must verify option passing through domain layer
- Must verify error handling in domain context
- Cannot test Commander.js behavior without real execution

### File Organization

```
src/
├── cli.ts                      # Domain router entry point
├── commands/
│   └── spec/                   # Spec domain commands
│       ├── index.ts            # Barrel export
│       ├── status.ts           # Status command (moved)
│       └── next.ts             # Next command (moved)
├── domains/
│   ├── types.ts                # Domain type definitions
│   ├── registry.ts             # Domain registry (story-21)
│   └── spec/
│       └── index.ts            # Spec domain registration
└── ...
```

### Migration Strategy

1. **Move files**: Use git mv to preserve history
   ```bash
   git mv src/commands/status.ts src/commands/spec/status.ts
   git mv src/commands/next.ts src/commands/spec/next.ts
   ```

2. **Update imports**: All imports of moved files need `.js` extension updates

3. **Verify**: Run existing tests to ensure no regression

### Design Decisions

1. **Commander.js subcommands**: Use `.command()` to create nested structure
2. **Same action handlers**: Keep existing command logic, just change registration
3. **Version bump**: Update to 0.2.0 to indicate new architecture
