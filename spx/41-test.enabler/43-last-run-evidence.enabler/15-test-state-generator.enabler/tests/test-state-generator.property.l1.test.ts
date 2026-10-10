import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { TEST_RUN_STATE_STATUS } from "@/test/run-state";
import { TEST_RUN_STATE_TEST_GENERATOR } from "@testing/generators/testing/run-state";
import { assertProperty, PROPERTY_CLASSIFICATION } from "@testing/harnesses/property/property";

describe("test-run-state generator", () => {
  it("draws every generated status from the source-owned status set", () => {
    const statuses = Object.values(TEST_RUN_STATE_STATUS);

    fc.assert(
      fc.property(TEST_RUN_STATE_TEST_GENERATOR.testRunState(), (state) => {
        expect(statuses).toContain(state.status);
      }),
    );
  });

  it("produces non-empty, disjoint test-path pairs", () => {
    fc.assert(
      fc.property(TEST_RUN_STATE_TEST_GENERATOR.disjointTestPathsPair(), ([first, second]) => {
        expect(first.length).toBeGreaterThan(0);
        expect(second.length).toBeGreaterThan(0);
        expect(first.some((path) => second.includes(path))).toBe(false);
      }),
    );
  });

  it("builds a terminal state whose runner outcomes cover exactly the given test paths, one outcome per group", () => {
    assertProperty(
      fc.tuple(
        TEST_RUN_STATE_TEST_GENERATOR.testRunState(),
        TEST_RUN_STATE_TEST_GENERATOR.disjointTestPathsPair(),
        TEST_RUN_STATE_TEST_GENERATOR.timestampDate(),
        TEST_RUN_STATE_TEST_GENERATOR.timestampDate(),
      ),
      ([base, groups, completedDate, startedDate]) => {
        const completedAt = completedDate.toISOString();
        const startedAt = startedDate.toISOString();
        const { stateCovering, stateCoveringAcross } = TEST_RUN_STATE_TEST_GENERATOR;

        const split = stateCoveringAcross(base, groups, completedAt, startedAt);
        expect(split.runnerOutcomes.map((outcome) => outcome.testPaths)).toEqual(groups);
        for (const outcome of split.runnerOutcomes) {
          expect(outcome.pathVerdicts.map((pathVerdict) => pathVerdict.testPath)).toEqual(outcome.testPaths);
        }
        expect(split.completedAt).toBe(completedAt);
        expect(split.startedAt).toBe(startedAt);
        expect({
          ...split,
          runnerOutcomes: base.runnerOutcomes,
          completedAt: base.completedAt,
          startedAt: base.startedAt,
        }).toEqual(base);

        const [group] = groups;
        const grouped = stateCovering(base, group, completedAt, startedAt);
        expect(grouped.runnerOutcomes.map((outcome) => outcome.testPaths)).toEqual([group]);

        const empty = stateCovering(base, [], completedAt, startedAt);
        expect(empty.runnerOutcomes).toEqual([]);
      },
      PROPERTY_CLASSIFICATION.SMALL_L1,
    );
  });

  it("persists a terminal state under the given run file name so the file content decodes to that state", () => {
    assertProperty(
      fc.tuple(TEST_RUN_STATE_TEST_GENERATOR.runFileName(), TEST_RUN_STATE_TEST_GENERATOR.testRunState()),
      ([runFileName, state]) => {
        const file = TEST_RUN_STATE_TEST_GENERATOR.persistedRunFile(runFileName, state);

        expect(file.name).toBe(runFileName);
        expect(JSON.parse(file.content)).toEqual(state);
      },
      PROPERTY_CLASSIFICATION.SMALL_L1,
    );
  });
});
