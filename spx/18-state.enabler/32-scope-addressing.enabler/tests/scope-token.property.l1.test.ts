import { describe, expect, it } from "vitest";

import { composeScopeDir, domainDir, STATE_STORE_ERROR, validateScopeToken, worktreeScopeDir } from "@/lib/state-store";
import { STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("scope token rejection", () => {
  it("rejects every token containing a path separator or relative segment before it becomes a path segment", () => {
    assertProperty(
      STATE_STORE_TEST_GENERATOR.unsafeScopeComposition(),
      ({ productRoot, safeToken, unsafeToken }) => {
        const scopeDir = worktreeScopeDir(productRoot);

        expect(validateScopeToken(unsafeToken)).toEqual({ ok: false, error: STATE_STORE_ERROR.INVALID_TOKEN });
        expect(composeScopeDir(scopeDir, safeToken, unsafeToken)).toEqual({
          ok: false,
          error: STATE_STORE_ERROR.INVALID_TOKEN,
        });
        expect(domainDir(scopeDir, unsafeToken)).toEqual({ ok: false, error: STATE_STORE_ERROR.INVALID_TOKEN });
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
