import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { archiveCommand, SESSION_ARCHIVE_OUTPUT } from "@/commands/session/archive";
import { deleteCommand, SESSION_DELETE_OUTPUT } from "@/commands/session/delete";
import { pickupCommand } from "@/commands/session/pickup";
import { releaseCommand, SESSION_RELEASE_OUTPUT } from "@/commands/session/release";
import { showCommand } from "@/commands/session/show";
import { BatchError } from "@/domains/session/batch";
import { SESSION_SHOW_LABEL } from "@/domains/session/show";
import { SESSION_PRIORITY, SESSION_STATUSES } from "@/domains/session/types";
import { sampleDistinctSessionIds, sampleSessionContent, sampleSessionId } from "@testing/generators/session/session";
import { ABSENT_SESSION_ID, createSessionHarness, type SessionHarness } from "@testing/harnesses/session/harness";

const [TODO, DOING, ARCHIVE] = SESSION_STATUSES;

// Each batch test takes a fresh harness; the lifecycle is file-scoped so no describe repeats it.
let harness: SessionHarness;

beforeEach(async () => {
  harness = await createSessionHarness();
});

afterEach(async () => {
  await harness.cleanup();
});

describe("batch archive", () => {
  it("S1: GIVEN 3 sessions in todo WHEN archive with 3 IDs THEN all 3 move to archive", async () => {
    const ids = [...sampleDistinctSessionIds(3)];
    for (const id of ids) {
      await harness.writeSession(TODO, id);
    }

    const output = await archiveCommand({ sessionIds: ids, sessionsDir: harness.sessionsDir });

    for (const id of ids) {
      expect(existsSync(join(harness.statusDir(ARCHIVE), `${id}.md`))).toBe(true);
      expect(existsSync(join(harness.statusDir(TODO), `${id}.md`))).toBe(false);
    }
    expect(output).toContain(SESSION_ARCHIVE_OUTPUT.ARCHIVED);
  });

  it("S4: GIVEN 1 valid + 1 invalid ID WHEN archive THEN valid succeeds, invalid errors", async () => {
    const validId = sampleSessionId();
    await harness.writeSession(TODO, validId);

    await expect(
      archiveCommand({ sessionIds: [validId, ABSENT_SESSION_ID], sessionsDir: harness.sessionsDir }),
    ).rejects.toThrow();

    // Valid one was still archived
    expect(existsSync(join(harness.statusDir(ARCHIVE), `${validId}.md`))).toBe(true);
  });

  it("S5: GIVEN single ID WHEN archive THEN identical to single-ID behavior", async () => {
    const id = sampleSessionId();
    await harness.writeSession(TODO, id);

    const output = await archiveCommand({ sessionIds: [id], sessionsDir: harness.sessionsDir });

    expect(existsSync(join(harness.statusDir(ARCHIVE), `${id}.md`))).toBe(true);
    expect(output).toContain(SESSION_ARCHIVE_OUTPUT.ARCHIVED);
    expect(output).toContain(id);
  });

  it("GIVEN a session of any frontmatter shape WHEN archive THEN moves", async () => {
    const id = sampleSessionId();
    await harness.writeRawSession(TODO, id, sampleSessionContent());

    await archiveCommand({ sessionIds: [id], sessionsDir: harness.sessionsDir });

    expect(existsSync(join(harness.statusDir(ARCHIVE), `${id}.md`))).toBe(true);
    expect(existsSync(join(harness.statusDir(TODO), `${id}.md`))).toBe(false);
  });
});

describe("batch delete", () => {
  it("S2: GIVEN 3 sessions WHEN delete with 3 IDs THEN all 3 removed", async () => {
    const ids = [...sampleDistinctSessionIds(3)];
    for (const id of ids) {
      await harness.writeSession(TODO, id);
    }

    const output = await deleteCommand({ sessionIds: ids, sessionsDir: harness.sessionsDir });

    for (const id of ids) {
      expect(existsSync(join(harness.statusDir(TODO), `${id}.md`))).toBe(false);
    }
    expect(output).toContain(SESSION_DELETE_OUTPUT.DELETED);
  });

  it("S4: GIVEN 1 valid + 1 invalid WHEN delete THEN valid deleted, invalid errors", async () => {
    const validId = sampleSessionId();
    await harness.writeSession(TODO, validId);

    await expect(
      deleteCommand({ sessionIds: [validId, ABSENT_SESSION_ID], sessionsDir: harness.sessionsDir }),
    ).rejects.toThrow();

    // Valid one was still deleted
    expect(existsSync(join(harness.statusDir(TODO), `${validId}.md`))).toBe(false);
  });
});

describe("batch release", () => {
  it("S6: GIVEN 2 sessions in doing WHEN release with 2 IDs THEN both move to todo", async () => {
    const ids = [...sampleDistinctSessionIds(2)];
    for (const id of ids) {
      await harness.writeSession(DOING, id);
    }

    const output = await releaseCommand({ sessionIds: ids, sessionsDir: harness.sessionsDir });

    for (const id of ids) {
      expect(existsSync(join(harness.statusDir(TODO), `${id}.md`))).toBe(true);
      expect(existsSync(join(harness.statusDir(DOING), `${id}.md`))).toBe(false);
    }
    expect(output).toContain(SESSION_RELEASE_OUTPUT.RELEASED);
  });

  it("S7: GIVEN 1 valid in doing + 1 invalid ID WHEN release THEN valid released, invalid errors", async () => {
    const validId = sampleSessionId();
    await harness.writeSession(DOING, validId);

    await expect(
      releaseCommand({ sessionIds: [validId, ABSENT_SESSION_ID], sessionsDir: harness.sessionsDir }),
    ).rejects.toThrow();

    expect(existsSync(join(harness.statusDir(TODO), `${validId}.md`))).toBe(true);
    expect(existsSync(join(harness.statusDir(DOING), `${validId}.md`))).toBe(false);
  });
});

describe("batch pickup", () => {
  it("GIVEN 2 sessions in todo WHEN pickup with 2 IDs THEN both move to doing", async () => {
    const ids = [...sampleDistinctSessionIds(2)];
    for (const id of ids) {
      await harness.writeSession(TODO, id);
    }

    const output = await pickupCommand({ sessionIds: ids, sessionsDir: harness.sessionsDir });

    for (const id of ids) {
      expect(existsSync(join(harness.statusDir(DOING), `${id}.md`))).toBe(true);
      expect(existsSync(join(harness.statusDir(TODO), `${id}.md`))).toBe(false);
      expect(output).toContain(`<PICKUP_ID>${id}</PICKUP_ID>`);
    }
  });

  it("GIVEN 1 valid in todo + 1 invalid ID WHEN pickup THEN valid claimed, invalid errors", async () => {
    const validId = sampleSessionId();
    await harness.writeSession(TODO, validId);

    await expect(
      pickupCommand({ sessionIds: [validId, ABSENT_SESSION_ID], sessionsDir: harness.sessionsDir }),
    ).rejects.toThrow(BatchError);

    expect(existsSync(join(harness.statusDir(DOING), `${validId}.md`))).toBe(true);
    expect(existsSync(join(harness.statusDir(TODO), `${validId}.md`))).toBe(false);
  });
});

describe("batch show", () => {
  it("S3: GIVEN 2 sessions WHEN show with 2 IDs THEN both contents printed", async () => {
    const [id1, id2] = sampleDistinctSessionIds(2);
    const priority1 = SESSION_PRIORITY.HIGH;
    const priority2 = SESSION_PRIORITY.LOW;
    await harness.writeSession(TODO, id1, { priority: priority1 });
    await harness.writeSession(TODO, id2, { priority: priority2 });

    const output = await showCommand({ sessionIds: [id1, id2], sessionsDir: harness.sessionsDir });

    expect(output).toContain(id1);
    expect(output).toContain(id2);
    expect(output).toContain(`${SESSION_SHOW_LABEL.PRIORITY}: ${priority1}`);
    expect(output).toContain(`${SESSION_SHOW_LABEL.PRIORITY}: ${priority2}`);
  });
});

describe("batch properties", () => {
  it("P2: GIVEN ordered IDs WHEN archive THEN processed left-to-right", async () => {
    const ids = [...sampleDistinctSessionIds(3)];
    for (const id of ids) {
      await harness.writeSession(TODO, id);
    }

    const output = await archiveCommand({ sessionIds: ids, sessionsDir: harness.sessionsDir });

    // Output mentions IDs in the same order they were provided.
    let lastIndex = -1;
    for (const id of ids) {
      const idx = output.indexOf(id);
      expect(idx).toBeGreaterThan(lastIndex);
      lastIndex = idx;
    }
  });
});
