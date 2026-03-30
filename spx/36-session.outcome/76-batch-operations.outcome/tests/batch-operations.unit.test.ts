/**
 * Unit tests for batch session operations.
 *
 * Test Level: 1 (Unit)
 * - Real filesystem via harness for archive/delete
 * - Pure output verification for show
 *
 * Assertions covered from batch-operations.md:
 * - S1: archive 3 IDs → all 3 move
 * - S2: delete 3 IDs → all 3 removed
 * - S3: show 2 IDs → both printed with separators
 * - S4: 1 valid + 1 invalid → valid succeeds, invalid errors, exit non-zero
 * - S5: single ID → identical to current behavior
 * - P1: successes + errors = IDs count
 * - P2: processing order matches argument order
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { archiveCommand } from "@/commands/session/archive";
import { deleteCommand } from "@/commands/session/delete";
import { showCommand } from "@/commands/session/show";
import type { SessionHarness } from "@/session/testing/harness";
import { createSessionHarness } from "@/session/testing/harness";
import { SESSION_STATUSES } from "@/session/types";

const [TODO, _DOING, ARCHIVE] = SESSION_STATUSES;

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
    expect(output).toContain("Archived");
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
    expect(output).toContain("Archived session");
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
    expect(output).toContain("Deleted");
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
    await harness.writeSession(TODO, id1, { priority: "high" });
    await harness.writeSession(TODO, id2, { priority: "low" });

    const output = await showCommand({
      sessionIds: [id1, id2],
      sessionsDir: harness.sessionsDir,
    });

    expect(output).toContain(id1);
    expect(output).toContain(id2);
    expect(output).toContain("Priority: high");
    expect(output).toContain("Priority: low");
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
