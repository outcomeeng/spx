import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { STATE_STORE_ERROR, validateScopeToken } from "@/lib/state-store";
import { STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";

describe("scope token rejection", () => {
  it("rejects every token containing a path separator or relative segment before it becomes a path segment", () => {
    fc.assert(
      fc.property(STATE_STORE_TEST_GENERATOR.scopeTokenContainingUnsafeMarker(), (unsafeToken) => {
        expect(validateScopeToken(unsafeToken)).toEqual({
          ok: false,
          error: STATE_STORE_ERROR.INVALID_TOKEN,
        });
      }),
    );
  });
});
