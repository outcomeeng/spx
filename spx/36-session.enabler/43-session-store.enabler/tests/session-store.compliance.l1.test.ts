import { handoffCommand } from "@/commands/session/handoff";
import { listCommand, SESSION_LIST_FORMAT } from "@/commands/session/list";
import { SessionLegacyFrontmatterInputError } from "@/domains/session/errors";
import {
  SESSION_FILE_ENCODING,
  SESSION_FRONT_MATTER,
  SESSION_PRIORITY,
  SESSION_STATUSES,
} from "@/domains/session/types";
import { sampleSessionId } from "@testing/generators/session/session";
import {
  buildHandoffStdin,
  createSessionGitDeps,
  createSessionHarness,
  SESSION_FORBIDDEN_JSON_RECORD_FIELD,
  SessionHarness,
} from "@testing/harnesses/session/harness";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import rule, {
  NO_HARDCODED_SESSION_FRONTMATTER_KEYS_RULE_NAME,
  USE_SESSION_FRONTMATTER_MESSAGE_ID,
} from "@eslint-rules/no-hardcoded-session-frontmatter-keys";
import { extractSessionFile, parseFrontMatter } from "@testing/harnesses/session/session-store";
import { runValidationRuleTester } from "@testing/harnesses/validation/eslint";

// ISO 8601 with timezone: YYYY-MM-DDTHH:mm:ss[.SSS](Z|±HH:MM)
// Matches: 2026-01-13T10:00:00Z, 2026-01-13T10:00:00.000Z, 2026-01-13T10:00:00+00:00
const iso8601WithTimezoneOffset = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const complianceGitDeps = createSessionGitDeps();
const sessionCommandFixtureFile = join("src", "commands", "session", "frontmatter-fixture.ts");
const sessionTypesFixtureFile = join("src", "domains", "session", "types.ts");

describe("session-store compliance — timestamp format", () => {
  let harness: SessionHarness;

  beforeEach(async () => {
    harness = await createSessionHarness();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  it("ALWAYS: created_at in YAML front matter is ISO 8601 with timezone offset", async () => {
    const stdin = buildHandoffStdin(
      {
        priority: SESSION_PRIORITY.MEDIUM,
        goal: "Compliance check",
        next_step: "Inspect created_at",
        specs: [],
        files: [],
      },
      "# Compliance test",
    );

    const { output } = await handoffCommand({
      content: stdin,
      sessionsDir: harness.sessionsDir,
      deps: complianceGitDeps,
    });
    const frontMatter = parseFrontMatter(await readFile(extractSessionFile(output), SESSION_FILE_ENCODING));

    expect(frontMatter).toHaveProperty(SESSION_FRONT_MATTER.CREATED_AT);
    expect(frontMatter[SESSION_FRONT_MATTER.CREATED_AT]).toMatch(iso8601WithTimezoneOffset);
  });
});

describe("session-store compliance — legacy YAML frontmatter input rejection", () => {
  let harness: SessionHarness;

  beforeEach(async () => {
    harness = await createSessionHarness();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  it("NEVER: handoff parses caller-supplied stdin as YAML — input opening with `---` is rejected", async () => {
    // Well-formed legacy YAML frontmatter stdin that the previous wire-format would have accepted.
    const legacyYamlStdin = "---\npriority: medium\ngoal: Legacy shape\nnext_step: Should reject\n---\n# Body";

    await expect(
      handoffCommand({
        content: legacyYamlStdin,
        sessionsDir: harness.sessionsDir,
        deps: complianceGitDeps,
      }),
    ).rejects.toBeInstanceOf(SessionLegacyFrontmatterInputError);
  });
});

describe("session-store compliance — declared frontmatter shape", () => {
  let harness: SessionHarness;

  beforeEach(async () => {
    harness = await createSessionHarness();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  it("NEVER: handoff writes a frontmatter key outside the declared shape", async () => {
    const stdin = buildHandoffStdin(
      {
        priority: SESSION_PRIORITY.MEDIUM,
        goal: "Shape check",
        next_step: "Inspect frontmatter keys",
        specs: [],
        files: [],
      },
      "# Shape test",
    );

    const { output } = await handoffCommand({
      content: stdin,
      sessionsDir: harness.sessionsDir,
      deps: complianceGitDeps,
    });
    const frontMatter = parseFrontMatter(await readFile(extractSessionFile(output), SESSION_FILE_ENCODING));

    const declaredKeys = new Set<string>(Object.values(SESSION_FRONT_MATTER));
    for (const key of Object.keys(frontMatter)) {
      expect(declaredKeys.has(key), `unexpected frontmatter key: ${key}`).toBe(true);
    }
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
          filename: sessionCommandFixtureFile,
        },
        {
          code: `export const SESSION_FRONT_MATTER = { GOAL: "${SESSION_FRONT_MATTER.GOAL}" } as const`,
          filename: sessionTypesFixtureFile,
        },
        {
          code: `test("${SESSION_FRONT_MATTER.GOAL}", () => {});`,
          filename: "frontmatter-description.test.ts",
        },
        {
          code: `type SessionFrontmatterShape = { "${SESSION_FRONT_MATTER.GOAL}": string };`,
          filename: "frontmatter-shape.ts",
        },
      ],
      invalid: [
        {
          code: `const sessionFrontmatterKey = "${SESSION_FRONT_MATTER.GOAL}";`,
          filename: sessionCommandFixtureFile,
          errors: [{ messageId: USE_SESSION_FRONTMATTER_MESSAGE_ID }],
        },
      ],
    },
  });
});

describe("session-store compliance — JSON list output excludes the absolute path", () => {
  const [TODO] = SESSION_STATUSES;
  let harness: SessionHarness;

  beforeEach(async () => {
    harness = await createSessionHarness();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  it("NEVER: the JSON list output exposes the absolute filesystem path of a session", async () => {
    const id = sampleSessionId();
    await harness.writeSession(TODO, id);

    const output = await listCommand({
      status: TODO,
      format: SESSION_LIST_FORMAT.JSON,
      sessionsDir: harness.sessionsDir,
    });
    const records = (JSON.parse(output) as Record<string, Array<Record<string, unknown>>>)[TODO];

    expect(output).not.toContain(harness.sessionsDir);
    for (const record of records) {
      expect(record).not.toHaveProperty(SESSION_FORBIDDEN_JSON_RECORD_FIELD.PATH);
    }
  });
});
