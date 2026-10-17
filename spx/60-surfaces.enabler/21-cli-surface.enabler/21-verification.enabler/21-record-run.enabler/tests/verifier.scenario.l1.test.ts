import { describe, expect, it } from "vitest";

import { VERIFY_CLI_EXIT_CODE } from "@/commands/verify/cli";
import { VERIFY_RUN_CONTEXT_EVENT_FIELD } from "@/domains/verify/verify";
import { sampleVerifyTestValue, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import { observeVerificationRunStartVerifier } from "@testing/harnesses/verify/harness";

describe("record-run start Verifier", () => {
  it("records the Verifier named by spx verification run start --verifier on the started run", async () => {
    const verifier = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.verifier());
    await observeVerificationRunStartVerifier(verifier).then((observation) => {
      expect(observation.rejectedByCommander).toBe(false);
      expect(observation.startResults.map((result) => result.exitCode)).toStrictEqual([VERIFY_CLI_EXIT_CODE.OK]);
      expect(observation.runContextData[VERIFY_RUN_CONTEXT_EVENT_FIELD.VERIFIER_KIND]).toBe(verifier.kind);
      expect(observation.runContextData[VERIFY_RUN_CONTEXT_EVENT_FIELD.VERIFIER_ID]).toBe(verifier.id);
    });
  });
});
