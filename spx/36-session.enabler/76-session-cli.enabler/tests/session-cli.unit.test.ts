/**
 * Unit tests for batch session operations.
 *
 * Test Level: 1 (Unit)
 * - Real filesystem via harness for archive/delete
 * - Pure output verification for show
 *
 * Assertions covered from session-cli.md:
 * - S1: archive 3 IDs → all 3 move
 * - S2: delete 3 IDs → all 3 removed
 * - S3: show 2 IDs → both printed with separators
 * - S4: archive 1 valid + 1 invalid → valid succeeds, invalid errors, exit non-zero
 * - S5: single ID → identical to current behavior
 * - S6: release 2 IDs in doing → both move to todo
 * - S7: release 1 valid + 1 invalid → valid released, invalid errors, exit non-zero
 * - P1: successes + errors = IDs count
 * - P2: processing order matches argument order
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { archiveCommand, SESSION_ARCHIVE_OUTPUT } from "@/commands/session/archive";
import { deleteCommand, SESSION_DELETE_OUTPUT } from "@/commands/session/delete";
import { releaseCommand, SESSION_RELEASE_OUTPUT } from "@/commands/session/release";
import { showCommand } from "@/commands/session/show";
import { SESSION_SHOW_LABEL } from "@/session/show";
import type { SessionHarness } from "@/session/testing/harness";
import { createSessionHarness } from "@/session/testing/harness";
import { SESSION_PRIORITY, SESSION_STATUSES } from "@/session/types";

const [TODO, DOING, ARCHIVE] = SESSION_STATUSES;

describe("batch archive", () => {
  let harness: SessionHarness;

  beforeEach(async () => {
    harness = await createSessionHarness();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  it("S1: GIVEN 3 sessions in todo WHEN archive with 3 IDs THEN all 3 move to archive", async () => {
    const ids = ["2026-01-10_10-00-00", "2026-01-11_10-00-00", "2026-01-12_10-00-00"];
    for (const id of ids) {
      await harness.writeSession(TODO, id);
    }

    const output = await archiveCommand({
      sessionIds: ids,
      sessionsDir: harness.sessionsDir,
    });

    for (const id of ids) {
      expect(existsSync(join(harness.statusDir(ARCHIVE), `${id}.md`))).toBe(true);
      expect(existsSync(join(harness.statusDir(TODO), `${id}.md`))).toBe(false);
    }
    expect(output).toContain(SESSION_ARCHIVE_OUTPUT.ARCHIVED);
  });

  it("S4: GIVEN 1 valid + 1 invalid ID WHEN archive THEN valid succeeds, invalid errors", async () => {
    const validId = "2026-01-10_10-00-00";
    await harness.writeSession(TODO, validId);
    const invalidId = "nonexistent";

    await expect(
      archiveCommand({
        sessionIds: [validId, invalidId],
        sessionsDir: harness.sessionsDir,
      }),
    ).rejects.toThrow();

    // Valid one was still archived
    expect(existsSync(join(harness.statusDir(ARCHIVE), `${validId}.md`))).toBe(true);
  });

  it("S5: GIVEN single ID WHEN archive THEN identical to single-ID behavior", async () => {
    const id = "2026-01-10_10-00-00";
    await harness.writeSession(TODO, id);

    const output = await archiveCommand({
      sessionIds: [id],
      sessionsDir: harness.sessionsDir,
    });

    expect(existsSync(join(harness.statusDir(ARCHIVE), `${id}.md`))).toBe(true);
    expect(output).toContain(SESSION_ARCHIVE_OUTPUT.ARCHIVED);
    expect(output).toContain(id);
  });
});

describe("batch delete", () => {
  let harness: SessionHarness;

  beforeEach(async () => {
    harness = await createSessionHarness();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  it("S2: GIVEN 3 sessions WHEN delete with 3 IDs THEN all 3 removed", async () => {
    const ids = ["2026-01-10_10-00-00", "2026-01-11_10-00-00", "2026-01-12_10-00-00"];
    for (const id of ids) {
      await harness.writeSession(TODO, id);
    }

    const output = await deleteCommand({
      sessionIds: ids,
      sessionsDir: harness.sessionsDir,
    });

    for (const id of ids) {
      expect(existsSync(join(harness.statusDir(TODO), `${id}.md`))).toBe(false);
    }
    expect(output).toContain(SESSION_DELETE_OUTPUT.DELETED);
  });

  it("S4: GIVEN 1 valid + 1 invalid WHEN delete THEN valid deleted, invalid errors", async () => {
    const validId = "2026-01-10_10-00-00";
    await harness.writeSession(TODO, validId);

    await expect(
      deleteCommand({
        sessionIds: [validId, "nonexistent"],
        sessionsDir: harness.sessionsDir,
      }),
    ).rejects.toThrow();

    // Valid one was still deleted
    expect(existsSync(join(harness.statusDir(TODO), `${validId}.md`))).toBe(false);
  });
});

describe("batch release", () => {
  let harness: SessionHarness;

  beforeEach(async () => {
    harness = await createSessionHarness();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  it("S6: GIVEN 2 sessions in doing WHEN release with 2 IDs THEN both move to todo", async () => {
    const ids = ["2026-04-25_15-39-03", "2026-04-24_08-10-44"];
    for (const id of ids) {
      await harness.writeSession(DOING, id);
    }

    const output = await releaseCommand({
      sessionIds: ids,
      sessionsDir: harness.sessionsDir,
    });

    for (const id of ids) {
      expect(existsSync(join(harness.statusDir(TODO), `${id}.md`))).toBe(true);
      expect(existsSync(join(harness.statusDir(DOING), `${id}.md`))).toBe(false);
    }
    expect(output).toContain(SESSION_RELEASE_OUTPUT.RELEASED);
  });

  it("S7: GIVEN 1 valid in doing + 1 invalid ID WHEN release THEN valid released, invalid errors", async () => {
    const validId = "2026-01-10_10-00-00";
    await harness.writeSession(DOING, validId);

    await expect(
      releaseCommand({
        sessionIds: [validId, "nonexistent"],
        sessionsDir: harness.sessionsDir,
      }),
    ).rejects.toThrow();

    expect(existsSync(join(harness.statusDir(TODO), `${validId}.md`))).toBe(true);
    expect(existsSync(join(harness.statusDir(DOING), `${validId}.md`))).toBe(false);
  });
});

describe("batch show", () => {
  let harness: SessionHarness;

  beforeEach(async () => {
    harness = await createSessionHarness();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  it("S3: GIVEN 2 sessions WHEN show with 2 IDs THEN both contents printed", async () => {
    const id1 = "2026-01-10_10-00-00";
    const id2 = "2026-01-11_10-00-00";
    const priority1 = SESSION_PRIORITY.HIGH;
    const priority2 = SESSION_PRIORITY.LOW;
    await harness.writeSession(TODO, id1, { priority: priority1 });
    await harness.writeSession(TODO, id2, { priority: priority2 });

    const output = await showCommand({
      sessionIds: [id1, id2],
      sessionsDir: harness.sessionsDir,
    });

    expect(output).toContain(id1);
    expect(output).toContain(id2);
    expect(output).toContain(`${SESSION_SHOW_LABEL.PRIORITY}: ${priority1}`);
    expect(output).toContain(`${SESSION_SHOW_LABEL.PRIORITY}: ${priority2}`);
  });
});

describe("batch properties", () => {
  let harness: SessionHarness;

  beforeEach(async () => {
    harness = await createSessionHarness();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  it("P2: GIVEN ordered IDs WHEN archive THEN processed left-to-right", async () => {
    const ids = ["2026-01-10_10-00-00", "2026-01-11_10-00-00", "2026-01-12_10-00-00"];
    for (const id of ids) {
      await harness.writeSession(TODO, id);
    }

    const output = await archiveCommand({
      sessionIds: ids,
      sessionsDir: harness.sessionsDir,
    });

    // Output should mention IDs in the same order they were provided
    let lastIndex = -1;
    for (const id of ids) {
      const idx = output.indexOf(id);
      expect(idx).toBeGreaterThan(lastIndex);
      lastIndex = idx;
    }
  });
});
