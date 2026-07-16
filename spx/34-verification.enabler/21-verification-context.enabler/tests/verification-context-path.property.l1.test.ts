import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createVerificationContextDocument } from "@/domains/verification-context/context";
import {
  VERIFICATION_CONTEXT_STATE_DOMAIN,
  VERIFICATION_CONTEXT_STATE_PATH,
  verificationContextFilePath,
} from "@/domains/verification-context/path";
import { STATE_STORE_SCOPE_PATH } from "@/lib/state-store";
import { VERIFICATION_CONTEXT_TEST_GENERATOR } from "@testing/generators/verification-context";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("verificationContextFilePath", () => {
  it("composes the branch-scoped context file path for every valid scope", () => {
    assertProperty(
      VERIFICATION_CONTEXT_TEST_GENERATOR.pathPropertyScenario(),
      (scenario) => {
        const document = createVerificationContextDocument(scenario.payload);
        expect(document.ok).toBe(true);
        if (!document.ok) return;
        const result = verificationContextFilePath({
          productDir: scenario.productDir,
          branchSlug: scenario.branchSlug,
          digest: document.value.digest,
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const expectedContextFile = [
          VERIFICATION_CONTEXT_STATE_PATH.FILE_PREFIX,
          document.value.digest,
          VERIFICATION_CONTEXT_STATE_PATH.JSON_EXTENSION,
        ].join("");
        expect(result.value).toBe(
          join(
            scenario.productDir,
            STATE_STORE_SCOPE_PATH.SPX_DIR,
            STATE_STORE_SCOPE_PATH.BRANCH_SCOPE,
            scenario.branchSlug,
            VERIFICATION_CONTEXT_STATE_DOMAIN,
            VERIFICATION_CONTEXT_STATE_PATH.CONTEXTS_DIR,
            expectedContextFile,
          ),
        );
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
