import { readFile } from "node:fs/promises";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { handoffCommand } from "@/commands/session/handoff";
import { createSessionHarness, type SessionHarness } from "@/session/testing/harness";
import { SESSION_FRONT_MATTER } from "@/session/types";

import { extractSessionFile, parseFrontMatter } from "./helpers";

// ISO 8601 with timezone: YYYY-MM-DDTHH:mm:ss[.SSS](Z|±HH:MM)
// Matches: 2026-01-13T10:00:00Z, 2026-01-13T10:00:00.000Z, 2026-01-13T10:00:00+00:00
const ISO_8601_WITH_TIMEZONE_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

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
      content: `---\npriority: medium\n---\n# Compliance test`,
      sessionsDir: harness.sessionsDir,
    });
    const frontMatter = parseFrontMatter(await readFile(extractSessionFile(output), "utf-8"));

    expect(frontMatter).toHaveProperty(SESSION_FRONT_MATTER.CREATED_AT);
    expect(frontMatter[SESSION_FRONT_MATTER.CREATED_AT]).toMatch(ISO_8601_WITH_TIMEZONE_OFFSET);
  });
});
