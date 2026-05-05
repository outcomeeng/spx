import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { describe } from "vitest";

import rule, {
  ASYNC_SPAWN_OUTSIDE_LIFECYCLE_MESSAGE_ID,
  NO_ASYNC_SPAWN_OUTSIDE_LIFECYCLE_RULE_NAME,
} from "@eslint-rules/no-async-spawn-outside-lifecycle";

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    parser: tseslint.parser,
  },
});

describe("no-async-spawn-outside-lifecycle", () => {
  ruleTester.run(NO_ASYNC_SPAWN_OUTSIDE_LIFECYCLE_RULE_NAME, rule, {
    valid: [
      {
        name: "lifecycle module imports spawn",
        code: `import { spawn } from "node:child_process";`,
        filename: "src/lib/process-lifecycle/install.ts",
      },
      {
        name: "test-infrastructure harness imports spawn",
        code: `import { spawn } from "node:child_process";`,
        filename: "testing/harnesses/process-lifecycle/spawn-fixture.ts",
      },
      {
        name: "synchronous execSync outside lifecycle is exempt",
        code: `import { execSync } from "node:child_process";`,
        filename: "src/git/root.ts",
      },
      {
        name: "synchronous spawnSync outside lifecycle is exempt",
        code: `import { spawnSync } from "node:child_process";`,
        filename: "src/lib/precommit/run.ts",
      },
      {
        name: "non-spawn child_process imports outside lifecycle are exempt",
        code: `import { exec, execFile } from "node:child_process";`,
        filename: "src/some-domain/runner.ts",
      },
      {
        name: "type-only spawn import is acceptable (only runtime imports forbidden)",
        code: `import type { ChildProcess } from "node:child_process";`,
        filename: "src/some-domain/types.ts",
      },
    ],
    invalid: [
      {
        name: "spawn import in domain code is rejected",
        code: `import { spawn } from "node:child_process";`,
        filename: "src/validation/steps/eslint.ts",
        errors: [{ messageId: ASYNC_SPAWN_OUTSIDE_LIFECYCLE_MESSAGE_ID }],
      },
      {
        name: "spawn alongside other named imports is rejected",
        code: `import { exec, spawn } from "node:child_process";`,
        filename: "src/some-domain/runner.ts",
        errors: [{ messageId: ASYNC_SPAWN_OUTSIDE_LIFECYCLE_MESSAGE_ID }],
      },
      {
        name: "spawn import via legacy specifier is rejected",
        code: `import { spawn } from "child_process";`,
        filename: "src/some-domain/runner.ts",
        errors: [{ messageId: ASYNC_SPAWN_OUTSIDE_LIFECYCLE_MESSAGE_ID }],
      },
    ],
  });
});
