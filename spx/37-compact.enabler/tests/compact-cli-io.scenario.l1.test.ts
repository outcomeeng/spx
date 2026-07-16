import { describe, expect, it } from "vitest";

import { COMPACT_RECORD_FIELDS } from "@/domains/compact";
import { withRetrieveExitObservation } from "@testing/harnesses/compact/cli";

describe("compact CLI IO", () => {
  it("records retrieve exit code without immediate process exit after writing output", async () => {
    await withRetrieveExitObservation(({ cliRetrieved, cliStored, expectedRecord }) => {
      expect([...(cliStored?.immediateExitCodes ?? []), ...(cliStored?.deferredExitCodes ?? [])]).toEqual([0]);
      expect(cliRetrieved?.immediateExitCodes).toHaveLength(0);
      expect(cliRetrieved?.deferredExitCodes).toEqual([0]);
      expect(cliRetrieved?.stdout).toContain(expectedRecord?.[COMPACT_RECORD_FIELDS.ACTIVE_NODE]);
    });
  });
});
