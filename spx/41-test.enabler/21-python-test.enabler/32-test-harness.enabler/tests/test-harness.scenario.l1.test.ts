import { tmpdir } from "node:os";
import { resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

import { arbitraryDomainLiteral, sampleLiteralTestValue } from "@testing/generators/literal/literal";
import {
  observeTempPytestProductAfterThrow,
  observeTempPytestProductLifecycle,
  PYTEST_FIXTURE,
} from "@testing/harnesses/testing/python-runner";

describe("withTempPytestProduct", () => {
  it("materializes the fixture suite under the OS temp root and removes the product after the callback returns", async () => {
    const observation = await observeTempPytestProductLifecycle(PYTEST_FIXTURE.PASSING);

    expect(resolve(observation.productDir).startsWith(resolve(tmpdir()) + sep)).toBe(true);
    expect(observation.suitePath.startsWith(observation.productDir)).toBe(true);
    expect(observation.suiteExistedDuringCallback).toBe(true);
    expect(observation.productExistsAfterCallback).toBe(false);
    expect(observation.suiteExistsAfterCallback).toBe(false);
  });

  it("removes the product and rethrows the original error when the callback throws", async () => {
    const failure = new Error(sampleLiteralTestValue(arbitraryDomainLiteral()));

    const observation = await observeTempPytestProductAfterThrow(PYTEST_FIXTURE.FAILING, failure);

    expect(observation.existedDuringCallback).toBe(true);
    expect(observation.rejection).toBe(failure);
    expect(observation.existsAfterCallback).toBe(false);
  });
});
