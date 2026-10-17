import { describe, expect, it } from "vitest";

import { VERIFY_CLI_EXIT_CODE, VERIFY_STATUS_REPORT_FIELD } from "@/commands/verify/cli";
import { VERIFY_RUN_CONTEXT_EVENT_FIELD } from "@/domains/verify/verify";
import { sampleVerifyTestValue, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import { observeStartVerifier } from "@testing/harnesses/verify/harness";

describe("verify start Verifier", () => {
  it("records the Verifier's kind and id on the run-context event and reports them through status", async () => {
    const verifier = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.verifier());
    await observeStartVerifier(verifier).then((observation) => {
      expect(observation.started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
      expect(observation.runContextCount).toBe(1);
      expect(observation.runContextData[VERIFY_RUN_CONTEXT_EVENT_FIELD.VERIFIER_KIND]).toBe(verifier.kind);
      expect(observation.runContextData[VERIFY_RUN_CONTEXT_EVENT_FIELD.VERIFIER_ID]).toBe(verifier.id);
      expect(observation.status.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
      expect(observation.statusReport[VERIFY_STATUS_REPORT_FIELD.VERIFIER_KIND]).toBe(verifier.kind);
      expect(observation.statusReport[VERIFY_STATUS_REPORT_FIELD.VERIFIER_ID]).toBe(verifier.id);
    });
  });
});
