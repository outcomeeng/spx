import { handoffCommand } from "@/commands/session/handoff";
import { SESSION_FRONT_MATTER } from "@/domains/session/types";
import type { GitDependencies } from "@/git/root";
import { createSessionHarness, SessionHarness } from "@testing/harnesses/session/harness";
import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import rule, {
  NO_HARDCODED_SESSION_FRONTMATTER_KEYS_RULE_NAME,
  USE_SESSION_FRONTMATTER_MESSAGE_ID,
} from "@eslint-rules/no-hardcoded-session-frontmatter-keys";
import { runValidationRuleTester } from "@testing/harnesses/validation/eslint";
import { extractSessionFile, parseFrontMatter } from "./helpers";

// ISO 8601 with timezone: YYYY-MM-DDTHH:mm:ss[.SSS](Z|±HH:MM)
// Matches: 2026-01-13T10:00:00Z, 2026-01-13T10:00:00.000Z, 2026-01-13T10:00:00+00:00
const ISO_8601_WITH_TIMEZONE_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const COMPLIANCE_GIT_DEPS: GitDependencies = {
  execa: async (_command, args) => {
    const argText = args.join(" ");
    if (argText.includes("--abbrev-ref")) return { exitCode: 0, stdout: "main", stderr: "" };
    if (argText.includes("--show-toplevel")) return { exitCode: 0, stdout: "/repo", stderr: "" };
    if (argText.includes("--git-common-dir")) return { exitCode: 0, stdout: "/repo/.git", stderr: "" };
    return { exitCode: 1, stdout: "", stderr: "" };
  },
};

describe("session-store compliance — timestamp format", () => {
  let harness: SessionHarness;

  beforeEach(async () => {
    harness = await createSessionHarness();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  it("ALWAYS: created_at in YAML front matter is ISO 8601 with timezone offset", async () => {
    const output = await handoffCommand({
      content: `---\npriority: medium\ngoal: Compliance check\nnext_step: Inspect created_at\n---\n# Compliance test`,
      sessionsDir: harness.sessionsDir,
      deps: COMPLIANCE_GIT_DEPS,
    });
    const frontMatter = parseFrontMatter(await readFile(extractSessionFile(output), "utf-8"));

    expect(frontMatter).toHaveProperty(SESSION_FRONT_MATTER.CREATED_AT);
    expect(frontMatter[SESSION_FRONT_MATTER.CREATED_AT]).toMatch(ISO_8601_WITH_TIMEZONE_OFFSET);
  });
});

describe("session-store compliance — frontmatter key registry", () => {
  runValidationRuleTester({
    ruleName: NO_HARDCODED_SESSION_FRONTMATTER_KEYS_RULE_NAME,
    rule,
    cases: {
      valid: [
        {
          code:
            `import { SESSION_FRONT_MATTER } from "@/domains/session/types";\nconst key = SESSION_FRONT_MATTER.GOAL;`,
          filename: "src/commands/session/example.ts",
        },
        {
          code: `export const SESSION_FRONT_MATTER = { GOAL: "${SESSION_FRONT_MATTER.GOAL}" } as const;`,
          filename: "src/domains/session/types.ts",
        },
        {
          code: `it("${SESSION_FRONT_MATTER.GOAL} is required", () => {});`,
          filename: "spx/36-session.enabler/43-session-store.enabler/tests/example.test.ts",
        },
      ],
      invalid: [
        {
          code: `const key = "${SESSION_FRONT_MATTER.GOAL}";`,
          filename: "src/commands/session/example.ts",
          errors: [{ messageId: USE_SESSION_FRONTMATTER_MESSAGE_ID }],
        },
      ],
    },
  });
});
