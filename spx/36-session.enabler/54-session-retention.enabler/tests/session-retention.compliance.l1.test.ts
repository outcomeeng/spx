import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { archiveCommand } from "@/commands/session/archive";
import { SESSION_STATUSES } from "@/domains/session/types";
import { sampleSessionContent, sampleSessionId } from "@testing/generators/session/session";
import { createSessionHarness, type SessionHarness } from "@testing/harnesses/session/harness";

const [TODO, , ARCHIVE] = SESSION_STATUSES;

describe("session retention compliance", () => {
  let harness: SessionHarness;

  beforeEach(async () => {
    harness = await createSessionHarness();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  it("ALWAYS: archive moves a session to archive/ regardless of its frontmatter shape", async () => {
    const sessionId = sampleSessionId();
    await harness.writeRawSession(TODO, sessionId, sampleSessionContent());

    await archiveCommand({ sessionIds: [sessionId], sessionsDir: harness.sessionsDir });

    expect(existsSync(join(harness.statusDir(ARCHIVE), `${sessionId}.md`))).toBe(true);
    expect(existsSync(join(harness.statusDir(TODO), `${sessionId}.md`))).toBe(false);
  });

  it("NEVER: archive rejects a session for a missing or empty frontmatter field", async () => {
    const sessionId = sampleSessionId();
    await harness.writeSession(TODO, sessionId, { goal: "", next_step: "" });

    await archiveCommand({ sessionIds: [sessionId], sessionsDir: harness.sessionsDir });

    expect(existsSync(join(harness.statusDir(ARCHIVE), `${sessionId}.md`))).toBe(true);
    expect(existsSync(join(harness.statusDir(TODO), `${sessionId}.md`))).toBe(false);
  });
});
