import { describe, expect, it } from "vitest";

import { VERIFY_CLI_ERROR, VERIFY_CLI_EXIT_CODE } from "@/commands/verify/cli";
import { VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";
import { observeStartWithVerifierState } from "@testing/harnesses/verify/harness";

describe("verify start Verifier compliance", () => {
  it("rejects a Verifier with an unsupported kind or an empty id before any run state exists", async () => {
    await assertProperty(
      VERIFY_TEST_GENERATOR.invalidVerifier(),
      async (verifier) => {
        const observation = await observeStartWithVerifierState(verifier);
        expect(observation.started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(observation.started.output).toBe(VERIFY_CLI_ERROR.VERIFIER_INVALID);
        expect(observation.stateRootExists).toBe(false);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("rejects a Verifier with a whitespace-only id before any run state exists", async () => {
    await assertProperty(
      VERIFY_TEST_GENERATOR.whitespaceOnlyIdVerifier(),
      async (verifier) => {
        const observation = await observeStartWithVerifierState(verifier);
        expect(observation.started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(observation.started.output).toBe(VERIFY_CLI_ERROR.VERIFIER_INVALID);
        expect(observation.stateRootExists).toBe(false);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("accepts a person or agent Verifier with a non-empty id and creates the run state", async () => {
    await assertProperty(
      VERIFY_TEST_GENERATOR.verifier(),
      async (verifier) => {
        const observation = await observeStartWithVerifierState(verifier);
        expect(observation.started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(observation.stateRootExists).toBe(true);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
