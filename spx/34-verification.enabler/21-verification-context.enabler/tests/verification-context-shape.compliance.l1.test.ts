import { describe, expect, it } from "vitest";

import { VERIFICATION_CONTEXT_RUNTIME_ONLY_FIELDS } from "@/domains/verification-context/context";
import { runRuntimeContaminatedVerificationContextFileScenario } from "@testing/harnesses/verification-context/harness";

describe("verification context shape", () => {
  it("excludes supplied runtime-only outcome fields from the persisted pre-execution document", async () => {
    await runRuntimeContaminatedVerificationContextFileScenario().then(({ document }) => {
      for (const field of Object.values(VERIFICATION_CONTEXT_RUNTIME_ONLY_FIELDS)) {
        expect(document.context).not.toHaveProperty(field);
      }
    });
  });
});
