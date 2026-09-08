import { tmpdir } from "node:os";
import { resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

import { arbitraryDomainLiteral, sampleLiteralTestValue } from "@testing/generators/literal/literal";
import {
  COPIED_SUITE_NAME,
  observeTempVitestProductAfterThrow,
  observeTempVitestProductLifecycle,
  VITEST_FIXTURE,
} from "@testing/harnesses/testing/typescript-runner";

describe("withTempVitestProduct", () => {
  it("materializes the Vitest fixture suite under the OS temp root and removes the product after the callback returns", async () => {
    const observation = await observeTempVitestProductLifecycle(VITEST_FIXTURE.PASSING);

    expect(resolve(observation.productDir).startsWith(resolve(tmpdir()) + sep)).toBe(true);
    expect(observation.entriesDuringCallback).toEqual([COPIED_SUITE_NAME]);
    expect(observation.existsAfterCallback).toBe(false);
  });

  it("removes the Vitest product and rethrows the original error when the callback throws", async () => {
    const failure = new Error(sampleLiteralTestValue(arbitraryDomainLiteral()));

    const observation = await observeTempVitestProductAfterThrow(VITEST_FIXTURE.FAILING, failure);

    expect(observation.existedDuringCallback).toBe(true);
    expect(observation.rejection).toBe(failure);
    expect(observation.existsAfterCallback).toBe(false);
  });
});
