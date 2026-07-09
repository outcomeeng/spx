import fc from "fast-check";
import { describe, it } from "vitest";

import {
  compareRunRecencyNewestFirst,
  compareRunRecencyOldestFirst,
  createStateStoreRunToken,
  runFileName,
  type RunRecency,
  runTokenFromRunFileName,
  runTokenStartedAt,
} from "@/lib/state-store";
import { STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("record store — run-record token and recency mechanics", () => {
  it("composes and parses run file names as inverses, and rejects non-run-file names", () => {
    assertProperty(
      fc.tuple(STATE_STORE_TEST_GENERATOR.runToken(), STATE_STORE_TEST_GENERATOR.scopeToken()),
      ([runToken, nonRunFileName]) =>
        runTokenFromRunFileName(runFileName(runToken)) === runToken
        && runTokenFromRunFileName(nonRunFileName) === undefined,
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("recovers a run token's capture-timestamp prefix assigned when the token is composed", () => {
    assertProperty(
      fc.tuple(STATE_STORE_TEST_GENERATOR.runDate(), STATE_STORE_TEST_GENERATOR.runIdBytes()),
      ([date, idBytes]) => {
        const created = createStateStoreRunToken({ date, randomBytes: () => idBytes });
        return runTokenStartedAt(created.runToken) === created.startedAt;
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("orders run records oldest-first as the exact reverse of newest-first", () => {
    assertProperty(
      fc.tuple(STATE_STORE_TEST_GENERATOR.runRecency(), STATE_STORE_TEST_GENERATOR.runRecency()),
      ([left, right]) => compareRunRecencyOldestFirst(left, right) === -compareRunRecencyNewestFirst(left, right),
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("ranks newest-first by capture timestamp over creation time over run token, oldest-first the reverse", () => {
    assertProperty(
      fc.tuple(
        STATE_STORE_TEST_GENERATOR.runRecency(),
        fc.string({ minLength: 1 }),
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.string({ minLength: 1 }),
      ),
      ([base, startedAtBump, createdAtBump, runTokenBump]) => {
        // A non-empty suffix makes the extended string strictly greater than its prefix, and a
        // positive delta a strictly greater number — so ground truth is established by construction,
        // independent of the comparator under test. Each case makes the higher tier favor one record
        // while the strictly lower tiers favor the other, so the deciding tier must win: a comparator
        // with any other tier order ranks the wrong record newer.
        const decidingTierWins = ([newer, older]: readonly [RunRecency, RunRecency]): boolean =>
          compareRunRecencyNewestFirst(newer, older) < 0
          && compareRunRecencyOldestFirst(newer, older) === -compareRunRecencyNewestFirst(newer, older);

        // Capture timestamp decides even when both lower tiers favor the other record.
        const startedAtDecides: readonly [RunRecency, RunRecency] = [
          { startedAt: base.startedAt + startedAtBump, createdAtMs: base.createdAtMs, runToken: base.runToken },
          {
            startedAt: base.startedAt,
            createdAtMs: base.createdAtMs + createdAtBump,
            runToken: base.runToken + runTokenBump,
          },
        ];
        // Creation time breaks a capture-timestamp tie even when run token favors the other record.
        const createdAtDecides: readonly [RunRecency, RunRecency] = [
          { startedAt: base.startedAt, createdAtMs: base.createdAtMs + createdAtBump, runToken: base.runToken },
          { startedAt: base.startedAt, createdAtMs: base.createdAtMs, runToken: base.runToken + runTokenBump },
        ];
        // Run token breaks a full capture-timestamp and creation-time tie.
        const runTokenDecides: readonly [RunRecency, RunRecency] = [
          { startedAt: base.startedAt, createdAtMs: base.createdAtMs, runToken: base.runToken + runTokenBump },
          { startedAt: base.startedAt, createdAtMs: base.createdAtMs, runToken: base.runToken },
        ];

        return [startedAtDecides, createdAtDecides, runTokenDecides].every(decidingTierWins);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
