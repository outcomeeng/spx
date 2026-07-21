/**
 * Integration tests for session lifecycle — concurrent pickup atomicity.
 *
 * Test Level: 1 (Unit — fs.rename atomicity is OS-level, no external deps)
 * Uses level 2 because it tests concurrent real-filesystem behavior through command handlers.
 *
 * Assertion covered from session-lifecycle.md:
 * - P1: Concurrent pickup of the same session results in exactly one success
 */

import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { pickupCommand } from "@/commands/session/pickup";
import { SESSION_OUTPUT_MARKER, SESSION_PRIORITY, SESSION_STATUSES } from "@/domains/session/types";
import { sampleDistinctSessionIds, sampleSessionId } from "@testing/generators/session/session";
import type { SessionHarness } from "@testing/harnesses/session/harness";
import { createSessionHarness } from "@testing/harnesses/session/harness";
import { isFulfilledOutcome } from "@testing/harnesses/state/appendable-journal-store";

const [TODO, DOING] = SESSION_STATUSES;
const concurrentAgents = 5;

describe("concurrent pickup atomicity (P1)", () => {
  let harness: SessionHarness;

  beforeEach(async () => {
    harness = await createSessionHarness();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  it("GIVEN one session WHEN multiple agents pickup concurrently THEN exactly one succeeds", async () => {
    const sessionId = sampleSessionId();
    await harness.writeSession(TODO, sessionId, { priority: SESSION_PRIORITY.HIGH });

    // Launch concurrent pickups
    const results = await Promise.allSettled(
      Array.from(
        { length: concurrentAgents },
        () => pickupCommand({ sessionIds: [sessionId], sessionsDir: harness.sessionsDir }),
      ),
    );

    const successes = results.filter(isFulfilledOutcome);
    const failures = results.filter((result) => !isFulfilledOutcome(result));

    // Exactly one agent wins
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(concurrentAgents - 1);

    // Session moved into the doing directory and left the available queue
    expect(existsSync(join(harness.statusDir(DOING), `${sessionId}.md`))).toBe(true);
    expect(existsSync(join(harness.statusDir(TODO), `${sessionId}.md`))).toBe(false);
  });

  it("GIVEN multiple sessions WHEN agents pickup --auto concurrently THEN no double-claiming", async () => {
    const sessionCount = 3;
    for (const id of sampleDistinctSessionIds(sessionCount)) {
      await harness.writeSession(TODO, id, { priority: SESSION_PRIORITY.HIGH });
    }

    // Launch concurrent auto-pickups (more agents than sessions)
    const results = await Promise.allSettled(
      Array.from(
        { length: concurrentAgents },
        () => pickupCommand({ sessionIds: [], auto: true, sessionsDir: harness.sessionsDir }),
      ),
    );

    const successes = results.filter(isFulfilledOutcome);

    // At most as many successes as sessions
    expect(successes.length).toBeLessThanOrEqual(sessionCount);
    expect(successes.length).toBeGreaterThanOrEqual(1);

    // Each success claimed a different session (no duplicates)
    const claimedIds = successes.map((r) => {
      const output = r.value;
      const match = new RegExp(`<${SESSION_OUTPUT_MARKER.PICKUP_ID}>([^<]+)</${SESSION_OUTPUT_MARKER.PICKUP_ID}>`).exec(
        output,
      );
      return match?.[1];
    });
    const uniqueIds = new Set(claimedIds);
    expect(uniqueIds.size).toBe(claimedIds.length);

    // Doing directory has exactly the claimed sessions
    const doingFiles = await readdir(harness.statusDir(DOING));
    expect(doingFiles.filter((f) => f.endsWith(".md"))).toHaveLength(successes.length);
  });
});
