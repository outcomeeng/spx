import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { LITERAL_DEFAULTS } from "@/validation/literal/config";
import { arbitraryDomainLiteral } from "@testing/generators/literal/literal";
import { buildConfigWithAllowlist, readLiteralAllowlist } from "@testing/harnesses/literal-reuse/allowlist-existing";

describe("allowlist-existing test harness — properties", () => {
  it("readLiteralAllowlist returns buildConfigWithAllowlist's include list merged over the literal defaults", () => {
    fc.assert(
      fc.property(fc.array(arbitraryDomainLiteral()), (include) => {
        const config = buildConfigWithAllowlist({ include });

        expect(readLiteralAllowlist(config)).toEqual({ ...LITERAL_DEFAULTS, include });
      }),
    );
  });
});
