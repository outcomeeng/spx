import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { archiveCommand } from "@/commands/session/archive";
import { SESSION_STATUSES } from "@/domains/session/types";
import { sampleNonCanonicalSessionContent, sampleSessionId } from "@testing/generators/session/session";
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

  it("ALWAYS: archive reads result through the canonical frontmatter key before moving", async () => {
    const sessionId = sampleSessionId();
    await harness.writeSession(TODO, sessionId, { result: "Ready to archive" });

    await archiveCommand({ sessionIds: [sessionId], sessionsDir: harness.sessionsDir });

    expect(existsSync(join(harness.statusDir(ARCHIVE), `${sessionId}.md`))).toBe(true);
  });

  it("NEVER: archive moves a canonical session with an empty result field", async () => {
    const sessionId = sampleSessionId();
    await harness.writeSession(TODO, sessionId, { result: "" });

    await expect(
      archiveCommand({ sessionIds: [sessionId], sessionsDir: harness.sessionsDir }),
    ).rejects.toThrow(/result/i);

    expect(existsSync(join(harness.statusDir(TODO), `${sessionId}.md`))).toBe(true);
    expect(existsSync(join(harness.statusDir(ARCHIVE), `${sessionId}.md`))).toBe(false);
  });

  it("ALWAYS: archive moves a non-canonical session without the result check", async () => {
    const sessionId = sampleSessionId();
    await harness.writeRawSession(TODO, sessionId, sampleNonCanonicalSessionContent());

    await archiveCommand({ sessionIds: [sessionId], sessionsDir: harness.sessionsDir });

    expect(existsSync(join(harness.statusDir(ARCHIVE), `${sessionId}.md`))).toBe(true);
    expect(existsSync(join(harness.statusDir(TODO), `${sessionId}.md`))).toBe(false);
  });
});
