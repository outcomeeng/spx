import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { LOCKFILE_NAMES } from "@/test/languages/journal-reporter";
import { JOURNAL_RUN_TERMINAL_STATUS } from "@/test/languages/types";
import {
  expectedFindingsForScenario,
  expectedScopeForScenario,
  JOURNAL_REPORTER_TEST_GENERATOR,
} from "@testing/generators/testing/journal-reporter";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";
import {
  observeJournalReporterMapping,
  observeProductLockfileLookup,
} from "@testing/harnesses/testing/journal-reporter";

describe("journal reporter hook-to-evidence mapping", () => {
  // Every member of the source-owned terminal-status domain is enumerated, and every driven scenario
  // holds both a passing and a failing case, so each mapping row participates structurally rather
  // than by the luck of a draw.
  it.each(Object.values(JOURNAL_RUN_TERMINAL_STATUS))(
    "maps a module to a scope, failing cases to findings, passing cases to none, and run end to %s",
    async (reason) => {
      await assertProperty(
        JOURNAL_REPORTER_TEST_GENERATOR.mixedRunScenario(),
        async (scenario) => {
          const observation = await observeJournalReporterMapping(scenario, reason);
          expect(observation.scopes).toEqual([expectedScopeForScenario(scenario)]);
          expect(observation.findings).toEqual(expectedFindingsForScenario(scenario));
          expect(observation.terminalStatus).toBe(reason);
        },
        { level: PROPERTY_LEVEL.L1 },
      );
    },
  );
});

describe("product dependency lockfile lookup", () => {
  // The lockfile-name domain is the source-owned LOCKFILE_NAMES, enumerated in full: each name held
  // alone resolves to itself, and the names from each position onward resolve to the name at that
  // position, the preference order the domain declares.
  it.each(LOCKFILE_NAMES)("resolves a product root holding only %s to that lockfile", async (name) => {
    const observation = await observeProductLockfileLookup([name]);
    expect(observation.found).toBe(join(observation.realProductDir, name));
  });

  it.each(LOCKFILE_NAMES.map((name, index) => ({ name, held: LOCKFILE_NAMES.slice(index) })))(
    "prefers $name over every later lockfile in the domain order",
    async ({ name, held }) => {
      const observation = await observeProductLockfileLookup(held);
      expect(observation.found).toBe(join(observation.realProductDir, name));
    },
  );

  it("resolves no lockfile for a product root holding none", async () => {
    const observation = await observeProductLockfileLookup([]);
    expect(observation.found).toBeUndefined();
  });
});
