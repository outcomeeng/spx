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
  DIAGNOSTIC_UNAVAILABILITY,
  observeJournalReporterMapping,
  observeJournalReporterOverSymlinkedRoot,
  observeJournalReporterWithUnavailableDiagnostic,
  observeProductLockfileLookup,
  withSymlinkedProductRoot,
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

describe("journal reporter scope for a module whose reads are not directly observable", () => {
  // Assertion design record
  // - Assertion: a test module records a scope event carrying the product-relative paths of the product files the
  //   module loaded or opened, and a module whose import diagnostic is unavailable appends its scope with no read
  //   paths. Quantifier: for every module and every way its import diagnostic is unavailable (a finite enumeration);
  //   evidence type mapping.
  // - Production subject: the reporter's module-end hook, crossed with a Vitest module whose diagnostic is
  //   unavailable; the observation is the scope the sink received.
  // - Case provenance: the reporter ADR's sentence on an unavailable import diagnostic selects the class; the
  //   harness-owned enumeration of the ways a diagnostic is unavailable (it raises, it carries no durations) is the
  //   finite domain; the scenario generator supplies modules that also name opened files and a lockfile, so a scope
  //   built from those would carry read paths.
  // - Oracle owner: the ADR's construction law, a scope carrying the module id and no read paths, held in the
  //   expectation below independently of the reporter source. The unavailable diagnostic is a controlled failure
  //   simulation of the Vitest module (failure simulation exception).
  // - Rejected mutation: the reporter reads the import diagnostic unguarded, or continues with the opened files
  //   and the lockfile when the diagnostic is unavailable.
  // - Failure observation: the module-end hook rejects with the diagnostic's error, or the sink's scope carries read
  //   paths, so the toEqual expectation below fails.
  it.each(Object.values(DIAGNOSTIC_UNAVAILABILITY))(
    "appends a scope with no read paths for a module whose import diagnostic %s",
    async (unavailability) => {
      await assertProperty(
        JOURNAL_REPORTER_TEST_GENERATOR.mixedRunScenario(),
        async (scenario) => {
          const scopes = await observeJournalReporterWithUnavailableDiagnostic(scenario, unavailability);
          expect(scopes).toEqual([{ moduleId: scenario.moduleId }]);
        },
        { level: PROPERTY_LEVEL.L1 },
      );
    },
  );

  // Assertion design record
  // - Assertion: a test module records a scope event carrying the product-relative paths of the product files the
  //   module loaded or opened. Quantifier: for every module, here with a product root configured as a symbolic link;
  //   evidence type mapping over generated reads, with the link created once outside the generated cases.
  // - Production subject: the reporter's relativization of reported absolute paths against the module's project
  //   root, crossed with a real symbolic link as the project root while the run reports real paths.
  // - Case provenance: the scenario generator's reads, rebased by the harness onto a real product directory that a
  //   real symbolic link points at; the spec sentence on product-relative paths selects the class.
  // - Oracle owner: expectedScopeForScenario, the generator-held construction law over the rebased scenario's reads,
  //   independent of the reporter's relative-path computation.
  // - Rejected mutation: the reporter relativizes against the project root as configured (the link) rather than its
  //   resolved real path.
  // - Failure observation: every path then relativizes to a parent-escaping path and is dropped, so the scope loses
  //   its read paths and the toEqual expectation below fails for any module that reads a product file or lockfile.
  it("records the product-relative read paths of a module whose project root is a symbolic link to the product", async () => {
    await withSymlinkedProductRoot((roots) =>
      assertProperty(
        JOURNAL_REPORTER_TEST_GENERATOR.mixedRunScenario(),
        async (scenario) => {
          const observation = await observeJournalReporterOverSymlinkedRoot(scenario, roots);
          expect(observation.scopes).toEqual([expectedScopeForScenario(observation.realRootScenario)]);
        },
        { level: PROPERTY_LEVEL.L1 },
      )
    );
  });
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
