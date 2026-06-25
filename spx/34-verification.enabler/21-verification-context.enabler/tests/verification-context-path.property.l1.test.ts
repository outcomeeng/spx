import { join } from "node:path";

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  VERIFICATION_CONTEXT_STATE_DOMAIN,
  VERIFICATION_CONTEXT_STATE_PATH,
  verificationContextFilePath,
} from "@/domains/verification-context/path";
import { STATE_STORE_PATH } from "@/lib/state-store";
import { STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";
import { VERIFICATION_CONTEXT_TEST_GENERATOR } from "@testing/generators/verification-context";

describe("verificationContextFilePath", () => {
  it("composes the branch-scoped context file path for every valid scope", () => {
    fc.assert(
      fc.property(
        STATE_STORE_TEST_GENERATOR.productRoot(),
        STATE_STORE_TEST_GENERATOR.branchSlug(),
        VERIFICATION_CONTEXT_TEST_GENERATOR.payload(),
        (productDir, branchSlug, payload) => {
          const result = verificationContextFilePath({ productDir, branchSlug, digest: payload.launch.headSha });

          expect(result.ok).toBe(true);
          if (!result.ok) return;
          expect(result.value).toBe(
            join(
              productDir,
              STATE_STORE_PATH.SPX_DIR,
              STATE_STORE_PATH.BRANCH_SCOPE,
              branchSlug,
              VERIFICATION_CONTEXT_STATE_DOMAIN,
              VERIFICATION_CONTEXT_STATE_PATH.CONTEXTS_DIR,
              `${VERIFICATION_CONTEXT_STATE_PATH.FILE_PREFIX}${payload.launch.headSha}${VERIFICATION_CONTEXT_STATE_PATH.JSON_EXTENSION}`,
            ),
          );
        },
      ),
    );
  });
});
