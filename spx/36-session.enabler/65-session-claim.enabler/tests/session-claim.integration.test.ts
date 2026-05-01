/**
 * Integration tests for session lifecycle — concurrent pickup atomicity.
 *
 * Test Level: 1 (Unit — fs.rename atomicity is OS-level, no external deps)
 * Named .integration.test.ts because it tests concurrent real-filesystem behavior.
 *
 * Assertion covered from session-lifecycle.md:
 * - P1: Concurrent pickup of the same session results in exactly one success
 */

import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { pickupCommand } from "@/commands/session/pickup";
import { SESSION_STATUSES } from "@/domains/session/types";
import type { SessionHarness } from "@testing/harnesses/session/harness";
import { createSessionHarness } from "@testing/harnesses/session/harness";

const [TODO, DOING] = SESSION_STATUSES;
const CONCURRENT_AGENTS = 5;

describe("concurrent pickup atomicity (P1)", () => {
  let harness: SessionHarness;

  beforeEach(async () => {
    harness = await createSessionHarness();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  it("GIVEN one session WHEN multiple agents pickup concurrently THEN exactly one succeeds", async () => {
    const sessionId = "2026-01-13_08-00-00";
    await harness.writeSession(TODO, sessionId, { priority: "high" });

    // Launch concurrent pickups
    const results = await Promise.allSettled(
      Array.from({ length: CONCURRENT_AGENTS }, () => pickupCommand({ sessionId, sessionsDir: harness.sessionsDir })),
    );

    const successes = results.filter((r) => r.status === "fulfilled");
    const failures = results.filter((r) => r.status === "rejected");

    // Exactly one agent wins
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(CONCURRENT_AGENTS - 1);

    // Session is in doing, not todo
    expect(existsSync(join(harness.statusDir(DOING), `${sessionId}.md`))).toBe(true);
    expect(existsSync(join(harness.statusDir(TODO), `${sessionId}.md`))).toBe(false);
  });

  it("GIVEN multiple sessions WHEN agents pickup --auto concurrently THEN no double-claiming", async () => {
    const sessionCount = 3;
    for (let i = 0; i < sessionCount; i++) {
      await harness.writeSession(TODO, `2026-01-${10 + i}_10-00-00`, { priority: "high" });
    }

    // Launch concurrent auto-pickups (more agents than sessions)
    const results = await Promise.allSettled(
      Array.from({ length: CONCURRENT_AGENTS }, () => pickupCommand({ auto: true, sessionsDir: harness.sessionsDir })),
    );

    const successes = results.filter((r) => r.status === "fulfilled");

    // At most as many successes as sessions
    expect(successes.length).toBeLessThanOrEqual(sessionCount);
    expect(successes.length).toBeGreaterThanOrEqual(1);

    // Each success claimed a different session (no duplicates)
    const claimedIds = successes.map((r) => {
      const output = (r as PromiseFulfilledResult<string>).value;
      const match = output.match(/<PICKUP_ID>([^<]+)<\/PICKUP_ID>/);
      return match?.[1];
    });
    const uniqueIds = new Set(claimedIds);
    expect(uniqueIds.size).toBe(claimedIds.length);

    // Doing directory has exactly the claimed sessions
    const doingFiles = await readdir(harness.statusDir(DOING));
    expect(doingFiles.filter((f) => f.endsWith(".md"))).toHaveLength(successes.length);
  });
});
