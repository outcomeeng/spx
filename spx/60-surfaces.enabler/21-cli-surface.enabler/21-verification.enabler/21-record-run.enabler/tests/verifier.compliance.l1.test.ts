import { describe, expect, it } from "vitest";

import { VERIFY_CLI_ERROR, VERIFY_CLI_EXIT_CODE } from "@/commands/verify/cli";
import { VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";
import { observeVerificationRunStartVerifier } from "@testing/harnesses/verify/harness";

describe("record-run start Verifier compliance", () => {
  // Assertion design record
  // - Assertion: ALWAYS - `spx verification run start` accepts `--verifier <kind>:<id>` only with kind `person` or `agent`
  //   (universal over every Verifier whose kind lies outside those two), rejecting it before a run exists.
  // - Production subject: the `--verifier` operand validation of `spx verification run start`, crossed at the CLI command
  //   path through the commander program; the observation is the start result, the state root, and the run-context data.
  // - Case provenance: the invalid-Verifier generator the run-context node owns (`VERIFY_TEST_GENERATOR.invalidVerifier`),
  //   imported and not copied; its kind branch draws kinds outside the production kind registry, its id branch draws the
  //   empty id the same assertion rejects. The spec sentence selects the violation class.
  // - Oracle owner: the spec sentence (rejected, exit code ERROR, no run exists) with the source-owned
  //   `VERIFY_CLI_ERROR.VERIFIER_INVALID` and `VERIFY_CLI_EXIT_CODE.ERROR` outcome vocabulary.
  // - Rejected mutation: `start` accepts any Verifier kind (the kind check removed from verifier parsing).
  // - Failure observation: for a drawn unsupported kind the start result exits OK, `stateRootExists` is true, and the
  //   run-context data holds the Verifier, so the first three expectations below fail.
  it("rejects a Verifier with an unsupported kind through spx verification run start before a run exists", async () => {
    await assertProperty(
      VERIFY_TEST_GENERATOR.invalidVerifier(),
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
