import { describe, expect, it } from "vitest";

import { expectedRecordedPaths, READ_RECORDER_GENERATOR } from "@testing/generators/testing/read-recorder";
import {
  assertProperty,
  PROPERTY_CLASSIFICATION,
  propertyTestEnvelopeTimeoutMs,
} from "@testing/harnesses/property/property";
import { observeReadPlan } from "@testing/harnesses/testing/read-recorder";

describe("read recorder collected paths", () => {
  it(
    "holds the sorted unique absolute paths read, each resolved against the working directory at its read, and no entry when nothing was read",
    async () => {
      await assertProperty(READ_RECORDER_GENERATOR.readPlan(), async (plan) => {
        const { root, recordedPaths } = await observeReadPlan(plan);

        expect(recordedPaths).toEqual(expectedRecordedPaths(root, plan));
      }, PROPERTY_CLASSIFICATION.SMALL_L1);
    },
    propertyTestEnvelopeTimeoutMs(PROPERTY_CLASSIFICATION.SMALL_L1),
  );
});
