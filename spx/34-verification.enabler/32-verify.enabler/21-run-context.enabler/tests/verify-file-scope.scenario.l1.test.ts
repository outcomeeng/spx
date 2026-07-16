import { describe, expect, it } from "vitest";

import { VERIFICATION_CONTEXT_SUBJECT_KIND } from "@/domains/verification-context/context";
import { arbitrarySafeFileScopeIdentity } from "@testing/generators/verify/verify";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";
import { startFileScopeRun } from "@testing/harnesses/verify/harness";

describe("verify file-scope start", () => {
  it("records and reports a file subject without diff discovery", async () => {
    await assertProperty(
      arbitrarySafeFileScopeIdentity(),
      async (path) => {
        const started = await startFileScopeRun(path);
        expect(started.report.resolvedScope).toStrictEqual([path]);
        expect(started.context.context.subject).toStrictEqual({
          kind: VERIFICATION_CONTEXT_SUBJECT_KIND.FILE,
          path,
        });
        expect(started.nameStatusCalls).toBe(0);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
