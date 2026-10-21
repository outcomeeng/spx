import { existsSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { testingRunsDir } from "@/test/run-state";
import { NODE_STATUS_TEST_GENERATOR, PIN_CHECKOUT_EDIT } from "@testing/generators/node-status/node-status";
import { sampleGeneratedValue } from "@testing/generators/sample";
import {
  readNodeStatusFileBytes,
  readSpecTreeWorkingChanges,
  withPinCurrencyCheckout,
} from "@testing/harnesses/node-status/node-status";
import { readStatusJsonNode } from "@testing/harnesses/spec-tree/spec-cli-commands";

describe("spec status pin currency reporting", () => {
  it("ALWAYS: reporting pin currency executes no verification and writes nothing", async () => {
    // Each checkout is a state the pin-currency rule distinguishes: a pin over an
    // unchanged read set, and pins whose read set holds a changed subject or a changed
    // spec. The changed read sets are the violating inputs: reporting them leaves real
    // currency work to do, and the tempting responses are to re-run the test or to
    // refresh the claim.
    for (const edit of Object.values(PIN_CHECKOUT_EDIT)) {
      const checkout = sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.pinCurrencyCheckout(edit));
      await withPinCurrencyCheckout(checkout, async (repository) => {
        const productDir = repository.env.productDir;
        const claimsBefore = await readNodeStatusFileBytes(productDir);
        const changesBefore = await readSpecTreeWorkingChanges(productDir);

        const node = await readStatusJsonNode(productDir, repository.nodeId, repository.git);

        // The report reached the recorded pin, so the no-op observations below
        // judge a report that performed real currency work.
        expect(node?.claim?.results.map((result) => result.currency), checkout.edit).toEqual([checkout.currency]);
        expect(existsSync(testingRunsDir(productDir)), checkout.edit).toBe(false);
        expect(await readNodeStatusFileBytes(productDir), checkout.edit).toEqual(claimsBefore);
        expect(await readSpecTreeWorkingChanges(productDir), checkout.edit).toEqual(changesBefore);
      });
    }
  });
});
