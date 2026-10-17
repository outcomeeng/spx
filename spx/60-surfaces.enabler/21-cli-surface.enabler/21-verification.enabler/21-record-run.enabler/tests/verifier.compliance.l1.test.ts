import { describe, expect, it } from "vitest";

import { VERIFY_CLI_ERROR, VERIFY_CLI_EXIT_CODE } from "@/commands/verify/cli";
import { VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";
import { observeVerificationRunStartVerifier } from "@testing/harnesses/verify/harness";

describe("record-run start Verifier compliance", () => {
  it("rejects an empty Verifier id through spx verification run start before a run exists", async () => {
    await assertProperty(
      VERIFY_TEST_GENERATOR.emptyIdVerifier(),
      async (verifier) => {
        const observation = await observeVerificationRunStartVerifier(verifier);
        expect(observation.startResults.map((result) => result.exitCode)).toStrictEqual([VERIFY_CLI_EXIT_CODE.ERROR]);
        expect(observation.startResults.map((result) => result.output)).toStrictEqual([
          VERIFY_CLI_ERROR.VERIFIER_INVALID,
        ]);
        expect(observation.stateRootExists).toBe(false);
        expect(observation.runContextData).toStrictEqual({});
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("rejects a whitespace-only Verifier id through spx verification run start before a run exists", async () => {
    await assertProperty(
      VERIFY_TEST_GENERATOR.whitespaceOnlyIdVerifier(),
      async (verifier) => {
        const observation = await observeVerificationRunStartVerifier(verifier);
        expect(observation.startResults.map((result) => result.exitCode)).toStrictEqual([VERIFY_CLI_EXIT_CODE.ERROR]);
        expect(observation.startResults.map((result) => result.output)).toStrictEqual([
          VERIFY_CLI_ERROR.VERIFIER_INVALID,
        ]);
        expect(observation.stateRootExists).toBe(false);
        expect(observation.runContextData).toStrictEqual({});
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
