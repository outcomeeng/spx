import { describe, expect, it } from "vitest";

import { VERIFY_CLI_EXIT_CODE } from "@/commands/verify/cli";
import { VERIFY_CLI } from "@/interfaces/cli/verify";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { CHANGE_RUNS_TEST_GENERATOR } from "@testing/generators/verify/change-runs";
import { observeVerificationRunComparisonParse } from "@testing/harnesses/verify/harness";

describe("verification run compare argument compliance through the Commander program", () => {
  it("rejects an invocation naming no --run, naming the option and calling no handler", async () => {
    await observeVerificationRunComparisonParse(
      sampleGeneratedValue(
        CHANGE_RUNS_TEST_GENERATOR.runComparisonInvocation(
          CHANGE_RUNS_TEST_GENERATOR.comparedRunCountViolations().absent,
        ),
      ),
      false,
    ).then((observation) => {
      expect(observation.rejected).toBe(true);
      expect(observation.exitCode).not.toBe(VERIFY_CLI_EXIT_CODE.OK);
      expect(observation.stderr).toContain(VERIFY_CLI.runOption);
      expect(observation.compareOptions).toHaveLength(0);
      expect(observation.handlerInvocationCount).toBe(0);
    });
  });

  it("rejects every invocation naming --run fewer or more times than twice, with the run-count diagnostic and no handler call", async () => {
    await Promise.all(
      CHANGE_RUNS_TEST_GENERATOR.comparedRunCountViolations().present.map((runCount) =>
        observeVerificationRunComparisonParse(
          sampleGeneratedValue(CHANGE_RUNS_TEST_GENERATOR.runComparisonInvocation(runCount)),
          false,
        ).then((observation) => {
          expect(observation.rejected, observation.stderr).toBe(true);
          expect(observation.exitCode).not.toBe(VERIFY_CLI_EXIT_CODE.OK);
          expect(observation.stderr).toContain(VERIFY_CLI.compareRunCountError);
          expect(observation.compareOptions).toHaveLength(0);
          expect(observation.handlerInvocationCount).toBe(0);
        })
      ),
    );
  });

  it("hands the compare handler the Change and both --run values, the first named first, when --run is given exactly twice", async () => {
    const invocation = sampleGeneratedValue(
      CHANGE_RUNS_TEST_GENERATOR.runComparisonInvocation(VERIFY_CLI.compareRunCount),
    );
    await observeVerificationRunComparisonParse(invocation, false).then((observation) => {
      expect(observation.rejected, observation.stderr).toBe(false);
      expect(observation.compareOptions).toEqual([
        { change: invocation.change, firstRun: invocation.runTokens[0], secondRun: invocation.runTokens[1] },
      ]);
      expect(observation.handlerInvocationCount).toBe(1);
    });
  });

  it("rejects an invocation carrying a fresh --input, naming the option and calling no handler", async () => {
    await observeVerificationRunComparisonParse(
      sampleGeneratedValue(CHANGE_RUNS_TEST_GENERATOR.runComparisonInvocation(VERIFY_CLI.compareRunCount)),
      true,
    ).then((observation) => {
      expect(observation.rejected).toBe(true);
      expect(observation.exitCode).not.toBe(VERIFY_CLI_EXIT_CODE.OK);
      expect(observation.stderr).toContain(VERIFY_CLI.inputOption.split(" ")[0]);
      expect(observation.compareOptions).toHaveLength(0);
      expect(observation.handlerInvocationCount).toBe(0);
    });
  });
});
