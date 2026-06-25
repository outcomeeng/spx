/**
 * Unit tests for advanced session operations — prune and archive.
 *
 * Test Level: 1 (Unit)
 * - Pure functions: selectSessionsToDelete, validatePruneOptions,
 *   buildArchivePaths, findSessionForArchive
 * - Real filesystem via harness for prune/archive commands
 *
 * Assertions covered from advanced-operations.md:
 * - S1: prune --keep 5 deletes oldest, keeps 5 newest
 * - S2: prune default keeps 5
 * - S3: archive moves session to archive dir
 * - S4: archive already-archived → error
 * - S5: --dry-run shows what would be deleted without deleting
 * - P1: prune never deletes from active queues
 * - P2: prune --keep N >= total → deletes nothing
 */

import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { archiveCommand, SESSION_ARCHIVE_OUTPUT } from "@/commands/session/archive";
import { pruneCommand, SESSION_PRUNE_OUTPUT, validatePruneOptions } from "@/commands/session/prune";
import { type ArchivableStatus, buildArchivePaths, findSessionForArchive } from "@/domains/session/archive";
import { DEFAULT_SESSION_METADATA } from "@/domains/session/list";
import { DEFAULT_KEEP_COUNT, selectSessionsToDelete } from "@/domains/session/prune";
import { DEFAULT_PRIORITY, type Session, SESSION_STATUSES, type SessionPriority } from "@/domains/session/types";
import {
  sampleDistinctSessionIds,
  samplePathUnsafeAgentSessionIdentity,
  sampleSessionContent,
  sampleSessionId,
} from "@testing/generators/session/session";
import type { SessionHarness } from "@testing/harnesses/session/harness";
import { createSessionHarness } from "@testing/harnesses/session/harness";

const [TODO, DOING, ARCHIVE] = SESSION_STATUSES;

function orderedSessionIds(count: number): readonly string[] {
  return [...sampleDistinctSessionIds(count)].sort((left, right) => left.localeCompare(right));
}

/** Factory for test sessions — derives from SESSION_STATUSES. */
function createTestSession(overrides: {
  id?: string;
  priority?: SessionPriority;
  status?: typeof SESSION_STATUSES[number];
} = {}): Session {
  const id = overrides.id ?? sampleSessionId();
  const status = overrides.status ?? ARCHIVE;
  return {
    id,
    status,
    path: join(status, `${id}.md`),
    metadata: {
      ...DEFAULT_SESSION_METADATA,
      priority: overrides.priority ?? DEFAULT_PRIORITY,
    },
  };
}

// -- Pure function tests --

describe("selectSessionsToDelete", () => {
  it("GIVEN 10 sessions and keep=5 WHEN selected THEN returns 5 oldest", () => {
    const ids = orderedSessionIds(10);
    const sessions = ids.map((id) => createTestSession({ id }));

    const toPrune = selectSessionsToDelete(sessions, { keep: 5 });

    expect(toPrune.map((session) => session.id)).toEqual(ids.slice(0, 5));
  });

  it("P2: GIVEN keep >= total WHEN selected THEN returns empty", () => {
    const sessions = orderedSessionIds(2).map((id) => createTestSession({ id }));

    expect(selectSessionsToDelete(sessions, { keep: 5 })).toHaveLength(0);
    expect(selectSessionsToDelete(sessions, { keep: 2 })).toHaveLength(0);
  });

  it("GIVEN empty list WHEN selected THEN returns empty", () => {
    expect(selectSessionsToDelete([], { keep: 5 })).toHaveLength(0);
  });

  it("GIVEN mix of valid and unparsable IDs WHEN selected THEN unparsable deleted first", () => {
    const unparsableSessionId = samplePathUnsafeAgentSessionIdentity();
    const [firstValidSessionId, secondValidSessionId] = orderedSessionIds(2);
    const sessions = [
      createTestSession({ id: unparsableSessionId }),
      createTestSession({ id: firstValidSessionId }),
      createTestSession({ id: secondValidSessionId }),
    ];

    const toPrune = selectSessionsToDelete(sessions, { keep: 2 });

    expect(toPrune).toHaveLength(1);
    expect(toPrune[0].id).toBe(unparsableSessionId);
  });

  it("GIVEN all unparsable IDs WHEN selected THEN stable deterministic subset", () => {
    const sessions = [
      createTestSession({ id: "zzz" }),
      createTestSession({ id: "aaa" }),
      createTestSession({ id: "mmm" }),
    ];

    const first = selectSessionsToDelete(sessions, { keep: 1 });
    const second = selectSessionsToDelete(sessions, { keep: 1 });

    expect(first.map((s) => s.id)).toEqual(second.map((s) => s.id));
    expect(first).toHaveLength(2);
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
      const sessionId = sampleSessionId();
      const result = buildArchivePaths(sessionId, status, config);

      expect(result.target).toContain(config.archiveDir);
      expect(result.source).toContain(sessionId);
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
    const ids = orderedSessionIds(10);
    const oldestIds = ids.slice(0, 5);
    const newestIds = ids.slice(5);
    for (const id of ids) {
      await harness.writeSession(ARCHIVE, id);
    }

    const output = await pruneCommand({ keep: 5, sessionsDir: harness.sessionsDir });

    expect(output).toContain(`${SESSION_PRUNE_OUTPUT.DELETED} 5 sessions`);
    const remaining = await readdir(harness.statusDir(ARCHIVE));
    const remainingMarkdownFiles = remaining.filter((f) => f.endsWith(".md")).sort((left, right) =>
      left.localeCompare(right)
    );
    expect(remainingMarkdownFiles).toEqual(newestIds.map((id) => `${id}.md`));
    for (const id of oldestIds) {
      expect(existsSync(join(harness.statusDir(ARCHIVE), `${id}.md`))).toBe(false);
    }
  });

  it("S2: GIVEN archived sessions WHEN prune with no --keep THEN default retention applies", async () => {
    const sessionCount = DEFAULT_KEEP_COUNT + 3;
    for (const id of orderedSessionIds(sessionCount)) {
      await harness.writeSession(ARCHIVE, id);
    }

    const output = await pruneCommand({ sessionsDir: harness.sessionsDir });

    expect(output).toContain(`Deleted ${sessionCount - DEFAULT_KEEP_COUNT} sessions`);
    const remaining = await readdir(harness.statusDir(ARCHIVE));
    expect(remaining.filter((f) => f.endsWith(".md"))).toHaveLength(DEFAULT_KEEP_COUNT);
  });

  it("S5: GIVEN sessions WHEN prune --dry-run THEN nothing deleted", async () => {
    for (const id of orderedSessionIds(8)) {
      await harness.writeSession(ARCHIVE, id);
    }

    const output = await pruneCommand({ keep: 5, dryRun: true, sessionsDir: harness.sessionsDir });

    expect(output).toContain(SESSION_PRUNE_OUTPUT.WOULD_DELETE);
    // All sessions still exist
    const remaining = await readdir(harness.statusDir(ARCHIVE));
    expect(remaining.filter((f) => f.endsWith(".md"))).toHaveLength(8);
  });

  it("P1: GIVEN sessions in todo and doing WHEN prune THEN those directories untouched", async () => {
    const [todoSessionId, doingSessionId, ...archiveSessionIds] = orderedSessionIds(10);
    await harness.writeSession(TODO, todoSessionId);
    await harness.writeSession(DOING, doingSessionId);
    for (const id of archiveSessionIds) {
      await harness.writeSession(ARCHIVE, id);
    }

    await pruneCommand({ keep: 3, sessionsDir: harness.sessionsDir });

    // Active queues are untouched.
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
    const sessionId = sampleSessionId();
    await harness.writeSession(TODO, sessionId);

    const output = await archiveCommand({ sessionIds: [sessionId], sessionsDir: harness.sessionsDir });

    expect(output).toContain(SESSION_ARCHIVE_OUTPUT.ARCHIVED);
    expect(existsSync(join(harness.statusDir(ARCHIVE), `${sessionId}.md`))).toBe(true);
    expect(existsSync(join(harness.statusDir(TODO), `${sessionId}.md`))).toBe(false);
  });

  it("S3: GIVEN session in doing WHEN archive THEN moves to archive dir", async () => {
    const sessionId = sampleSessionId();
    await harness.writeSession(DOING, sessionId);

    const output = await archiveCommand({ sessionIds: [sessionId], sessionsDir: harness.sessionsDir });

    expect(output).toContain(SESSION_ARCHIVE_OUTPUT.ARCHIVED);
    expect(existsSync(join(harness.statusDir(ARCHIVE), `${sessionId}.md`))).toBe(true);
    expect(existsSync(join(harness.statusDir(DOING), `${sessionId}.md`))).toBe(false);
  });

  it("S4: GIVEN session already in archive WHEN archive THEN throws with already-archived message", async () => {
    const sessionId = sampleSessionId();
    await harness.writeSession(ARCHIVE, sessionId);

    await expect(
      archiveCommand({ sessionIds: [sessionId], sessionsDir: harness.sessionsDir }),
    ).rejects.toThrow(/already archived/i);
  });

  it("GIVEN session content of any frontmatter shape WHEN archive THEN moves to archive", async () => {
    const sessionId = sampleSessionId();
    await harness.writeRawSession(TODO, sessionId, sampleSessionContent());

    const output = await archiveCommand({ sessionIds: [sessionId], sessionsDir: harness.sessionsDir });

    expect(output).toContain(SESSION_ARCHIVE_OUTPUT.ARCHIVED);
    expect(existsSync(join(harness.statusDir(ARCHIVE), `${sessionId}.md`))).toBe(true);
    expect(existsSync(join(harness.statusDir(TODO), `${sessionId}.md`))).toBe(false);
  });

  it("GIVEN a session carrying a key outside the declared shape WHEN archive THEN moves unchanged", async () => {
    const sessionId = sampleSessionId();
    await harness.writeSession(TODO, sessionId, { extraYaml: ["tags:", "  - rust"] });

    await archiveCommand({ sessionIds: [sessionId], sessionsDir: harness.sessionsDir });

    expect(existsSync(join(harness.statusDir(ARCHIVE), `${sessionId}.md`))).toBe(true);
    expect(existsSync(join(harness.statusDir(TODO), `${sessionId}.md`))).toBe(false);
  });
});
