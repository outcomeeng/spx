/**
 * Property test for the audit test harness: branch run-file directory derivation
 * is deterministic for all product directory and branch slug inputs.
 *
 * Test Level: l1.
 */

import { join } from "node:path";

import { AUDIT_RUN_STATE_TEST_GENERATOR } from "@testing/generators/audit/run-state";
import { STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";
import { auditBranchRunsDir as resolveAuditBranchRunsDir } from "@testing/harnesses/audit/harness";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { STATE_STORE_DOMAIN, STATE_STORE_PATH } from "@/lib/state-store";

describe("audit branch runs directory determinism", () => {
  it("GIVEN product directories and branch slugs WHEN called repeatedly THEN the branch runs path is stable", () => {
    fc.assert(
      fc.property(
        STATE_STORE_TEST_GENERATOR.productRoot(),
        AUDIT_RUN_STATE_TEST_GENERATOR.branchSlug(),
        (productDir, branchSlug) => {
          const first = resolveAuditBranchRunsDir(productDir, branchSlug);
          const second = resolveAuditBranchRunsDir(productDir, branchSlug);
          const expected = join(
            productDir,
            STATE_STORE_PATH.SPX_DIR,
            STATE_STORE_PATH.BRANCH_SCOPE,
            branchSlug,
            STATE_STORE_DOMAIN.AUDIT,
            STATE_STORE_PATH.RUNS_DIR,
          );

          expect(first).toBe(second);
          expect(first).toBe(expected);
        },
      ),
    );
  });
});
