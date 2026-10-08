import { describe, expect, it } from "vitest";

import { VERIFY_CLI_EXIT_CODE, VERIFY_STATUS_REPORT_FIELD } from "@/commands/verify/cli";
import { VERIFY_DRIVE_MODE, VERIFY_RUN_CONTEXT_EVENT_FIELD } from "@/domains/verify/verify";
import { sampleVerifyTestValue, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import { observeStartChangeIdentity } from "@testing/harnesses/verify/harness";

describe("verify start Change identity", () => {
  it("records a canonical Change identity verbatim on the run-context event and reports it through status", async () => {
    const change = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.changeIdentity());
    await observeStartChangeIdentity(change).then((observation) => {
      expect(observation.started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
      expect(observation.runContextCount).toBe(1);
      expect(observation.runContextData[VERIFY_RUN_CONTEXT_EVENT_FIELD.CHANGE]).toBe(change);
      expect(observation.runContextData[VERIFY_RUN_CONTEXT_EVENT_FIELD.DRIVE_MODE]).toBe(VERIFY_DRIVE_MODE.CALLER);
      expect(observation.status.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
      expect(observation.statusReport[VERIFY_STATUS_REPORT_FIELD.CHANGE]).toBe(change);
    });
  });

  it("records no Change identity on the run-context event and reports none through status when start receives none", async () => {
    await observeStartChangeIdentity().then((observation) => {
      expect(observation.started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
      expect(observation.runContextCount).toBe(1);
      expect(Object.hasOwn(observation.runContextData, VERIFY_RUN_CONTEXT_EVENT_FIELD.CHANGE)).toBe(false);
      expect(observation.status.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
      expect(Object.hasOwn(observation.statusReport, VERIFY_STATUS_REPORT_FIELD.CHANGE)).toBe(false);
    });
  });
});
