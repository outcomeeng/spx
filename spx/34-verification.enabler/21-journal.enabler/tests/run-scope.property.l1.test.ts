import { join } from "node:path";

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { journalRunFilePath } from "@/domains/journal/run-scope";
import { runFileName, STATE_STORE_ERROR, STATE_STORE_PATH, STATE_STORE_SCOPE_PATH } from "@/lib/state-store";
import { STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";

describe("journalRunFilePath", () => {
  it("composes the branch-scoped run file path for every valid scope", () => {
    fc.assert(
      fc.property(
        STATE_STORE_TEST_GENERATOR.productRoot(),
        STATE_STORE_TEST_GENERATOR.branchSlug(),
        STATE_STORE_TEST_GENERATOR.scopeToken(),
        STATE_STORE_TEST_GENERATOR.runToken(),
        (productDir, branchSlug, type, runToken) => {
          const result = journalRunFilePath({ productDir, branchSlug, type, runToken });

          expect(result.ok).toBe(true);
          if (!result.ok) return;
          expect(result.value).toBe(
            join(
              productDir,
              STATE_STORE_SCOPE_PATH.SPX_DIR,
              STATE_STORE_SCOPE_PATH.BRANCH_SCOPE,
              branchSlug,
              type,
              STATE_STORE_PATH.RUNS_DIR,
              runFileName(runToken),
            ),
          );
        },
      ),
    );
  });

  it("rejects an opaque type segment containing an unsafe path marker", () => {
    fc.assert(
      fc.property(
        STATE_STORE_TEST_GENERATOR.productRoot(),
        STATE_STORE_TEST_GENERATOR.branchSlug(),
        STATE_STORE_TEST_GENERATOR.scopeTokenContainingUnsafeMarker(),
        STATE_STORE_TEST_GENERATOR.runToken(),
        (productDir, branchSlug, type, runToken) => {
          expect(journalRunFilePath({ productDir, branchSlug, type, runToken })).toEqual({
            ok: false,
            error: STATE_STORE_ERROR.INVALID_TOKEN,
          });
        },
      ),
    );
  });

  it("rejects a run token containing an unsafe path marker", () => {
    fc.assert(
      fc.property(
        STATE_STORE_TEST_GENERATOR.productRoot(),
        STATE_STORE_TEST_GENERATOR.branchSlug(),
        STATE_STORE_TEST_GENERATOR.scopeToken(),
        STATE_STORE_TEST_GENERATOR.scopeTokenContainingUnsafeMarker(),
        (productDir, branchSlug, type, runToken) => {
          expect(journalRunFilePath({ productDir, branchSlug, type, runToken })).toEqual({
            ok: false,
            error: STATE_STORE_ERROR.INVALID_TOKEN,
          });
        },
      ),
    );
  });

  it("rejects a branch slug that is not normalized for storage", () => {
    fc.assert(
      fc.property(
        STATE_STORE_TEST_GENERATOR.productRoot(),
        STATE_STORE_TEST_GENERATOR.scopeTokenContainingUnsafeMarker(),
        STATE_STORE_TEST_GENERATOR.scopeToken(),
        STATE_STORE_TEST_GENERATOR.runToken(),
        (productDir, branchSlug, type, runToken) => {
          expect(journalRunFilePath({ productDir, branchSlug, type, runToken })).toEqual({
            ok: false,
            error: STATE_STORE_ERROR.INVALID_BRANCH_SLUG,
          });
        },
      ),
    );
  });
});
