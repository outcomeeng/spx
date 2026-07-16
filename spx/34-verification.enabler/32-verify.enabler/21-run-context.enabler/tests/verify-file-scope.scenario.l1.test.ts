import { describe, expect, it } from "vitest";

import { VERIFICATION_CONTEXT_SUBJECT_KIND } from "@/domains/verification-context/context";
import { arbitraryFileScopeIdentityScenario, sampleVerifyTestValue } from "@testing/generators/verify/verify";
import { startFileScopeRun } from "@testing/harnesses/verify/harness";

describe("verify file-scope start", () => {
  it("records and reports a file subject without diff discovery", async () => {
    await expect(
      startFileScopeRun(sampleVerifyTestValue(arbitraryFileScopeIdentityScenario()).input),
    ).resolves.toMatchObject({
      report: {
        resolvedScope: [sampleVerifyTestValue(arbitraryFileScopeIdentityScenario()).normalized],
      },
      context: {
        context: {
          subject: {
            kind: VERIFICATION_CONTEXT_SUBJECT_KIND.FILE,
            path: sampleVerifyTestValue(arbitraryFileScopeIdentityScenario()).normalized,
          },
        },
      },
      nameStatusCalls: 0,
    });
  });
});
