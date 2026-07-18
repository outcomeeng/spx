import { describe, it } from "vitest";

import { assertReverseSealPreservesRunCreationOrder } from "@testing/harnesses/journal/seal-ordering";

describe("journal seal ordering", () => {
  it("preserves creation order when same-millisecond runs seal in reverse", async () =>
    assertReverseSealPreservesRunCreationOrder());
});
