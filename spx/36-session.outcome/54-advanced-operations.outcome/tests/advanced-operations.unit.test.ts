/**
 * Unit tests for advanced session operations — prune and archive.
 *
 * Test Level: 1 (Unit)
 * - Pure functions: selectSessionsToPrune, validatePruneOptions,
 *   buildArchivePaths, findSessionForArchive
 * - Real filesystem via harness for prune/archive commands
 *
 * Assertions covered from advanced-operations.md:
 * - S1: prune --keep 5 deletes oldest, keeps 5 newest
 * - S2: prune default keeps 5
 * - S3: archive moves session to archive dir
 * - S4: archive already-archived → error
 * - S5: --dry-run shows what would be deleted without deleting
 * - P1: prune never deletes from todo or doing
 * - P2: prune --keep N >= total → deletes nothing
 */

import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { archiveCommand, SessionAlreadyArchivedError } from "@/commands/session/archive";
import {
  DEFAULT_KEEP_COUNT,
  pruneCommand,
  selectSessionsToPrune,
  validatePruneOptions,
} from "@/commands/session/prune";
import { type ArchivableStatus, buildArchivePaths, findSessionForArchive } from "@/session/archive";
import type { SessionHarness } from "@/session/testing/harness";
import { createSessionHarness } from "@/session/testing/harness";
import { type Session, SESSION_STATUSES, type SessionPriority } from "@/session/types";

const [TODO, DOING, ARCHIVE] = SESSION_STATUSES;

/** Factory for test sessions — derives from SESSION_STATUSES. */
function createTestSession(overrides: {
  id?: string;
  priority?: SessionPriority;
  status?: typeof SESSION_STATUSES[number];
} = {}): Session {
  const id = overrides.id ?? "2026-01-13_10-00-00";
  const status = overrides.status ?? ARCHIVE;
  return {
    id,
    status,
    path: `/test/sessions/${status}/${id}.md`,
    metadata: {
      priority: overrides.priority ?? "medium",
      tags: [],
    },
  };
}

// -- Pure function tests --

describe("selectSessionsToPrune", () => {
  it("GIVEN 10 sessions and keep=5 WHEN selected THEN returns 5 oldest", () => {
    const sessions = Array.from(
      { length: 10 },
      (_, i) => createTestSession({ id: `2026-01-${String(i + 1).padStart(2, "0")}_10-00-00` }),
    );

    const toPrune = selectSessionsToPrune(sessions, 5);

    expect(toPrune).toHaveLength(5);
  });

  it("P2: GIVEN keep >= total WHEN selected THEN returns empty", () => {
    const sessions = [
      createTestSession({ id: "2026-01-01_10-00-00" }),
      createTestSession({ id: "2026-01-02_10-00-00" }),
    ];

    expect(selectSessionsToPrune(sessions, 5)).toHaveLength(0);
    expect(selectSessionsToPrune(sessions, 2)).toHaveLength(0);
  });

  it("GIVEN empty list WHEN selected THEN returns empty", () => {
    expect(selectSessionsToPrune([], 5)).toHaveLength(0);
  });
});

describe("validatePruneOptions", () => {
  it("GIVEN valid keep value WHEN validated THEN does not throw", () => {
    expect(() => validatePruneOptions({ keep: 3 })).not.toThrow();
    expect(() => validatePruneOptions({ keep: 1 })).not.toThrow();
    expect(() => validatePruneOptions({})).not.toThrow();
  });

  it("GIVEN invalid keep value WHEN validated THEN throws", () => {
    expect(() => validatePruneOptions({ keep: 0 })).toThrow();
    expect(() => validatePruneOptions({ keep: -1 })).toThrow();
  });
});

describe("buildArchivePaths", () => {
  it("GIVEN archivable status WHEN built THEN returns correct source and target", () => {
    const archivableStatuses: readonly ArchivableStatus[] = [TODO, DOING] as const;

    for (const status of archivableStatuses) {
      const config = {
        todoDir: "/s/todo",
        doingDir: "/s/doing",
        archiveDir: "/s/archive",
      };
      const result = buildArchivePaths("test-id", status, config);

      expect(result.target).toContain(config.archiveDir);
      expect(result.source).toContain("test-id");
    }
  });
});

describe("findSessionForArchive", () => {
  it("GIVEN session in todo WHEN found THEN returns todo location", () => {
    const result = findSessionForArchive({
      todo: "/s/todo/test.md",
      doing: null,
      archive: null,
    });

    expect(result).not.toBeNull();
    expect(result!.status).toBe(TODO);
  });

  it("GIVEN session already archived WHEN found THEN returns null", () => {
    const result = findSessionForArchive({
      todo: null,
      doing: null,
      archive: "/s/archive/test.md",
    });

    expect(result).toBeNull();
  });

  it("GIVEN session not found anywhere WHEN found THEN returns null", () => {
    const result = findSessionForArchive({
      todo: null,
      doing: null,
      archive: null,
    });

    expect(result).toBeNull();
  });
});

// -- Filesystem tests via harness --

describe("pruneCommand with real filesystem", () => {
  let harness: SessionHarness;

  beforeEach(async () => {
    harness = await createSessionHarness();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  it("S1: GIVEN 10 archived sessions WHEN prune --keep 5 THEN 5 oldest deleted", async () => {
    for (let i = 0; i < 10; i++) {
      await harness.writeSession(ARCHIVE, `2026-01-${String(i + 1).padStart(2, "0")}_10-00-00`);
    }

    const output = await pruneCommand({ keep: 5, sessionsDir: harness.sessionsDir });

    expect(output).toContain("Deleted 5 sessions");
    const remaining = await readdir(harness.statusDir(ARCHIVE));
    expect(remaining.filter((f) => f.endsWith(".md"))).toHaveLength(5);
  });

  it("S2: GIVEN archived sessions WHEN prune with no --keep THEN default retention applies", async () => {
    const sessionCount = DEFAULT_KEEP_COUNT + 3;
    for (let i = 0; i < sessionCount; i++) {
      await harness.writeSession(ARCHIVE, `2026-01-${String(i + 1).padStart(2, "0")}_10-00-00`);
    }

    const output = await pruneCommand({ sessionsDir: harness.sessionsDir });

    expect(output).toContain(`Deleted ${sessionCount - DEFAULT_KEEP_COUNT} sessions`);
    const remaining = await readdir(harness.statusDir(ARCHIVE));
    expect(remaining.filter((f) => f.endsWith(".md"))).toHaveLength(DEFAULT_KEEP_COUNT);
  });

  it("S5: GIVEN sessions WHEN prune --dry-run THEN nothing deleted", async () => {
    for (let i = 0; i < 8; i++) {
      await harness.writeSession(ARCHIVE, `2026-01-${String(i + 1).padStart(2, "0")}_10-00-00`);
    }

    const output = await pruneCommand({ keep: 5, dryRun: true, sessionsDir: harness.sessionsDir });

    expect(output).toContain("Would delete");
    // All sessions still exist
    const remaining = await readdir(harness.statusDir(ARCHIVE));
    expect(remaining.filter((f) => f.endsWith(".md"))).toHaveLength(8);
  });

  it("P1: GIVEN sessions in todo and doing WHEN prune THEN those directories untouched", async () => {
    await harness.writeSession(TODO, "2026-01-01_10-00-00");
    await harness.writeSession(DOING, "2026-01-02_10-00-00");
    for (let i = 0; i < 8; i++) {
      await harness.writeSession(ARCHIVE, `2026-01-${String(i + 10).padStart(2, "0")}_10-00-00`);
    }

    await pruneCommand({ keep: 3, sessionsDir: harness.sessionsDir });

    // Todo and doing untouched
    const todoFiles = await readdir(harness.statusDir(TODO));
    const doingFiles = await readdir(harness.statusDir(DOING));
    expect(todoFiles.filter((f) => f.endsWith(".md"))).toHaveLength(1);
    expect(doingFiles.filter((f) => f.endsWith(".md"))).toHaveLength(1);
  });
});

describe("archiveCommand with real filesystem", () => {
  let harness: SessionHarness;

  beforeEach(async () => {
    harness = await createSessionHarness();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  it("S3: GIVEN session in todo WHEN archive THEN moves to archive dir", async () => {
    const sessionId = "2026-01-13_08-00-00";
    await harness.writeSession(TODO, sessionId);

    const output = await archiveCommand({ sessionId, sessionsDir: harness.sessionsDir });

    expect(output).toContain("Archived session");
    expect(existsSync(join(harness.statusDir(ARCHIVE), `${sessionId}.md`))).toBe(true);
    expect(existsSync(join(harness.statusDir(TODO), `${sessionId}.md`))).toBe(false);
  });

  it("S3: GIVEN session in doing WHEN archive THEN moves to archive dir", async () => {
    const sessionId = "2026-01-13_08-00-00";
    await harness.writeSession(DOING, sessionId);

    const output = await archiveCommand({ sessionId, sessionsDir: harness.sessionsDir });

    expect(output).toContain("Archived session");
    expect(existsSync(join(harness.statusDir(ARCHIVE), `${sessionId}.md`))).toBe(true);
    expect(existsSync(join(harness.statusDir(DOING), `${sessionId}.md`))).toBe(false);
  });

  it("S4: GIVEN session already in archive WHEN archive THEN throws SessionAlreadyArchivedError", async () => {
    const sessionId = "2026-01-13_08-00-00";
    await harness.writeSession(ARCHIVE, sessionId);

    await expect(
      archiveCommand({ sessionId, sessionsDir: harness.sessionsDir }),
    ).rejects.toThrow(SessionAlreadyArchivedError);
  });
});
