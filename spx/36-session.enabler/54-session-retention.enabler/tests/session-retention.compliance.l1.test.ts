import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { archiveCommand } from "@/commands/session/archive";
import { SESSION_FRONT_MATTER } from "@/domains/session/types";
import { createSessionHarness, type SessionHarness } from "@testing/harnesses/session/harness";

describe("session retention compliance", () => {
  let harness: SessionHarness;

  beforeEach(async () => {
    harness = await createSessionHarness();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  it("ALWAYS: archive reads result through the canonical frontmatter key before moving", async () => {
    const [todo, , archive] = ["todo", "doing", "archive"] as const;
    const sessionId = "2026-01-13_10-00-00";
    await harness.writeSession(todo, sessionId, { result: "Ready to archive" });

    await archiveCommand({ sessionIds: [sessionId], sessionsDir: harness.sessionsDir });

    expect(existsSync(join(harness.statusDir(archive), `${sessionId}.md`))).toBe(true);
  });

  it("NEVER: archive moves a session with an empty result field", async () => {
    const [todo, , archive] = ["todo", "doing", "archive"] as const;
    const sessionId = "2026-01-13_10-00-00";
    await harness.writeSession(todo, sessionId, {
      extraYaml: [`${SESSION_FRONT_MATTER.RESULT}: ""`],
    });

    await expect(
      archiveCommand({ sessionIds: [sessionId], sessionsDir: harness.sessionsDir }),
    ).rejects.toThrow(/result/i);

    expect(existsSync(join(harness.statusDir(todo), `${sessionId}.md`))).toBe(true);
    expect(existsSync(join(harness.statusDir(archive), `${sessionId}.md`))).toBe(false);
  });
});
