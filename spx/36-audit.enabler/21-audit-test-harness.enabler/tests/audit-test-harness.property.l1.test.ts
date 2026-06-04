/**
 * Property test for the audit test harness: nodeDir path encoding is deterministic
 * for all spec node path strings.
 *
 * Test Level: l1.
 */

import { createAuditHarness } from "@testing/harnesses/audit/harness";
import * as fc from "fast-check";
import { describe, it } from "vitest";

describe("nodeDir", () => {
  it("GIVEN any spec node path string WHEN nodeDir is called twice THEN both calls return the same path", async () => {
    // Real bug class: encoding uses stateful counter, Date.now(), or random — all
    // produce non-repeatable output and would fail this property.
    const harness = await createAuditHarness();
    try {
      const segmentArb = fc.stringMatching(/^[a-z][a-z0-9\-.]{1,20}$/);
      const pathArb = fc
        .array(segmentArb, { minLength: 1, maxLength: 5 })
        .map((segs) => segs.join("/"));

      fc.assert(
        fc.property(pathArb, (nodePath) => {
          return harness.nodeDir(nodePath) === harness.nodeDir(nodePath);
        }),
      );
    } finally {
      await harness.cleanup();
    }
  });
});
