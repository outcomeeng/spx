/**
 * Unit tests for session lifecycle — pickup and release pure functions.
 *
 * Test Level: 1 (Unit)
 * - Pure functions: buildClaimPaths, classifyClaimError, selectBestSession,
 *   buildReleasePaths, findCurrentSession
 * - Real filesystem for pickup/release commands via harness
 *
 * Assertions covered from session-lifecycle.md:
 * - S1: pickup moves session to doing via rename()
 * - S2: release moves session back to todo
 * - S3: --auto claims highest-priority oldest
 * - S4: second agent gets SessionNotAvailableError
 * - P2: auto-pickup deterministic
 */

import fc from "fast-check";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { pickupCommand } from "@/commands/session/pickup";
import { releaseCommand, SESSION_RELEASE_OUTPUT } from "@/commands/session/release";
import { SessionNotAvailableError } from "@/session/errors";
import { buildClaimPaths, classifyClaimError, selectBestSession } from "@/session/pickup";
import { buildReleasePaths, findCurrentSession } from "@/session/release";
import type { SessionHarness } from "@/session/testing/harness";
import { createSessionHarness } from "@/session/testing/harness";
import {
  DEFAULT_PRIORITY,
  type Session,
  SESSION_PRIORITY,
  SESSION_STATUSES,
  type SessionPriority,
} from "@/session/types";

const [TODO, DOING] = SESSION_STATUSES;

/** Factory for test sessions — no hardcoded status strings. */
function createTestSession(overrides: { id?: string; priority?: SessionPriority } = {}): Session {
  const id = overrides.id ?? "2026-01-13_10-00-00";
  return {
    id,
    status: TODO,
    path: `/test/sessions/${TODO}/${id}.md`,
    metadata: {
      priority: overrides.priority ?? DEFAULT_PRIORITY,
      tags: [],
    },
  };
}

// -- Pure function tests --

describe("buildClaimPaths", () => {
  it("GIVEN session ID and config WHEN built THEN returns todo→doing paths", () => {
    const config = { todoDir: "/sessions/todo", doingDir: "/sessions/doing" };
    const sessionId = "2026-01-13_08-01-05";
    const result = buildClaimPaths(sessionId, config);

    expect(result.source).toContain(sessionId);
    expect(result.source).toContain(config.todoDir);
    expect(result.target).toContain(config.doingDir);
  });
});

describe("classifyClaimError", () => {
  it("GIVEN ENOENT error WHEN classified THEN returns SessionNotAvailableError", () => {
    const error = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    const sessionId = "test-id";
    const result = classifyClaimError(error, sessionId);

    expect(result).toBeInstanceOf(SessionNotAvailableError);
    expect(result.sessionId).toBe(sessionId);
  });

  it("GIVEN unknown error WHEN classified THEN rethrows", () => {
    const message = "Unknown";
    const error = new Error(message);
    expect(() => classifyClaimError(error, "test-id")).toThrow(message);
  });
});

describe("selectBestSession", () => {
  it("GIVEN sessions with different priorities WHEN selected THEN returns highest priority", () => {
    const sessions = [
      createTestSession({ id: "low-1", priority: SESSION_PRIORITY.LOW }),
      createTestSession({ id: "high-1", priority: SESSION_PRIORITY.HIGH }),
      createTestSession({ id: "medium-1", priority: SESSION_PRIORITY.MEDIUM }),
    ];
    const expected = sessions[1];

    expect(selectBestSession(sessions)?.id).toBe(expected.id);
  });

  it("GIVEN sessions with same priority WHEN selected THEN returns oldest (FIFO)", () => {
    const sessions = [
      createTestSession({ id: "2026-01-13_10-00-00", priority: SESSION_PRIORITY.HIGH }),
      createTestSession({ id: "2026-01-10_10-00-00", priority: SESSION_PRIORITY.HIGH }),
      createTestSession({ id: "2026-01-12_10-00-00", priority: SESSION_PRIORITY.HIGH }),
    ];
    const expected = sessions[1];

    expect(selectBestSession(sessions)?.id).toBe(expected.id);
  });

  it("GIVEN empty list WHEN selected THEN returns null", () => {
    expect(selectBestSession([])).toBeNull();
  });

  it("GIVEN input array WHEN selected THEN does not mutate original", () => {
    const sessions = [
      createTestSession({ id: "a", priority: SESSION_PRIORITY.LOW }),
      createTestSession({ id: "b", priority: SESSION_PRIORITY.HIGH }),
    ];
    const originalOrder = sessions.map((s) => s.id);

    selectBestSession(sessions);

    expect(sessions.map((s) => s.id)).toEqual(originalOrder);
  });

  it("GIVEN mix of valid and unparsable IDs at same priority WHEN selected THEN valid ID returned (FIFO)", () => {
    // Both orderings tested to exercise both sides of the invalid-ID comparator branches.
    const a = createTestSession({ id: "unparsable", priority: SESSION_PRIORITY.HIGH });
    const b = createTestSession({ id: "2026-01-13_10-00-00", priority: SESSION_PRIORITY.HIGH });

    expect(selectBestSession([a, b])?.id).toBe(b.id);
    expect(selectBestSession([b, a])?.id).toBe(b.id);
  });

  it("GIVEN all unparsable IDs at same priority WHEN selected THEN deterministic selection", () => {
    const sessions = [
      createTestSession({ id: "zzz", priority: SESSION_PRIORITY.HIGH }),
      createTestSession({ id: "aaa", priority: SESSION_PRIORITY.HIGH }),
    ];

    const first = selectBestSession(sessions);
    const second = selectBestSession(sessions);
    expect(first?.id).toBe(second?.id);
  });
});

describe("selectBestSession determinism (P2)", () => {
  it("GIVEN deterministic input WHEN called multiple times THEN always same result", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.stringMatching(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/),
            priority: fc.constantFrom<SessionPriority>(...Object.values(SESSION_PRIORITY)),
          }),
          { minLength: 1, maxLength: 10 },
        ),
        (inputs) => {
          const sessions = inputs.map((i) => createTestSession(i));
          const result1 = selectBestSession(sessions);
          const result2 = selectBestSession(sessions);
          expect(result1?.id).toBe(result2?.id);
        },
      ),
    );
  });
});

describe("buildReleasePaths", () => {
  it("GIVEN session ID and config WHEN built THEN returns doing→todo paths", () => {
    const config = { todoDir: "/sessions/todo", doingDir: "/sessions/doing" };
    const result = buildReleasePaths("2026-01-13_08-01-05", config);

    expect(result.source).toContain(config.doingDir);
    expect(result.target).toContain(config.todoDir);
  });
});

describe("findCurrentSession", () => {
  it("GIVEN multiple sessions WHEN found THEN returns most recent", () => {
    const sessions = [
      { id: "2026-01-10_08-00-00" },
      { id: "2026-01-13_08-00-00" },
      { id: "2026-01-11_08-00-00" },
    ];
    const expected = sessions[1];

    expect(findCurrentSession(sessions)?.id).toBe(expected.id);
  });

  it("GIVEN empty list WHEN found THEN returns null", () => {
    expect(findCurrentSession([])).toBeNull();
  });

  it("GIVEN input array WHEN found THEN does not mutate original", () => {
    const sessions = [
      { id: "2026-01-10_08-00-00" },
      { id: "2026-01-13_08-00-00" },
    ];
    const originalOrder = sessions.map((s) => s.id);

    findCurrentSession(sessions);

    expect(sessions.map((s) => s.id)).toEqual(originalOrder);
  });

  it("GIVEN mix of valid and unparsable IDs WHEN found THEN valid ID returned", () => {
    const sessions = [
      { id: "unparsable" },
      { id: "2026-01-13_08-00-00" },
    ];
    const expected = sessions[1];

    expect(findCurrentSession(sessions)?.id).toBe(expected.id);
  });

  it("GIVEN all unparsable IDs WHEN found THEN deterministic selection", () => {
    const sessions = [{ id: "zzz" }, { id: "aaa" }];
    const first = findCurrentSession(sessions);
    const second = findCurrentSession(sessions);

    expect(first?.id).toBe(second?.id);
  });
});

// -- Filesystem tests via harness (S1, S2, S3) --

describe("pickupCommand with real filesystem", () => {
  let harness: SessionHarness;

  beforeEach(async () => {
    harness = await createSessionHarness();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  it("S1: GIVEN session in todo WHEN pickup THEN file moves to doing", async () => {
    const sessionId = "2026-01-13_08-00-00";
    await harness.writeSession(TODO, sessionId, { priority: SESSION_PRIORITY.HIGH });

    const output = await pickupCommand({
      sessionId,
      sessionsDir: harness.sessionsDir,
    });

    expect(output).toContain(`<PICKUP_ID>${sessionId}</PICKUP_ID>`);
    // File should be in doing, not todo
    expect(existsSync(join(harness.statusDir(DOING), `${sessionId}.md`))).toBe(true);
    expect(existsSync(join(harness.statusDir(TODO), `${sessionId}.md`))).toBe(false);
  });

  it("S3: GIVEN sessions with different priorities WHEN pickup --auto THEN claims highest priority", async () => {
    const lowPrioritySessionId = "2026-01-10_10-00-00";
    const highPrioritySessionId = "2026-01-11_10-00-00";
    await harness.writeSession(TODO, lowPrioritySessionId, { priority: SESSION_PRIORITY.LOW });
    await harness.writeSession(TODO, highPrioritySessionId, { priority: SESSION_PRIORITY.HIGH });

    const output = await pickupCommand({
      auto: true,
      sessionsDir: harness.sessionsDir,
    });

    expect(output).toContain(`<PICKUP_ID>${highPrioritySessionId}</PICKUP_ID>`);
  });

  it("S4: GIVEN session already claimed WHEN second pickup THEN throws SessionNotAvailableError", async () => {
    const sessionId = "2026-01-13_08-00-00";
    await harness.writeSession(TODO, sessionId);

    // First pickup succeeds
    await pickupCommand({ sessionId, sessionsDir: harness.sessionsDir });

    // Second pickup fails
    await expect(
      pickupCommand({ sessionId, sessionsDir: harness.sessionsDir }),
    ).rejects.toThrow(SessionNotAvailableError);
  });
});

describe("releaseCommand with real filesystem", () => {
  let harness: SessionHarness;

  beforeEach(async () => {
    harness = await createSessionHarness();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  it("S2: GIVEN claimed session in doing WHEN release THEN file moves back to todo", async () => {
    const sessionId = "2026-01-13_08-00-00";
    // Write directly to doing (simulating a claimed session)
    await harness.writeSession(DOING, sessionId);

    const output = await releaseCommand({
      sessionIds: [sessionId],
      sessionsDir: harness.sessionsDir,
    });

    expect(output).toContain(SESSION_RELEASE_OUTPUT.RELEASED);
    // File should be in todo, not doing
    expect(existsSync(join(harness.statusDir(TODO), `${sessionId}.md`))).toBe(true);
    expect(existsSync(join(harness.statusDir(DOING), `${sessionId}.md`))).toBe(false);
  });
});
