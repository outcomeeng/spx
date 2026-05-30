import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { classifyNodeStatus, serializeNodeStatus } from "@/lib/node-status";
import { SPEC_TREE_NODE_STATE } from "@/lib/spec-tree/config";
import { NODE_STATUS_TEST_GENERATOR } from "@testing/generators/node-status/node-status";

describe("node-status writer output", () => {
  it("always serializes to a JSON object whose status is one of the four lifecycle values", () => {
    fc.assert(
      fc.property(NODE_STATUS_TEST_GENERATOR.facts(), (facts) => {
        const state = classifyNodeStatus(facts);
        const parsed = JSON.parse(serializeNodeStatus(state));
        // Membership is checked against the source-owned lifecycle values directly.
        expect(Object.values(SPEC_TREE_NODE_STATE)).toContain(parsed.status);
        expect(parsed.status).toBe(state);
      }),
    );
  });

  it("classifies deterministically: identical facts always map to the same state", () => {
    fc.assert(
      fc.property(NODE_STATUS_TEST_GENERATOR.facts(), (facts) => {
        expect(classifyNodeStatus(facts)).toBe(classifyNodeStatus(facts));
      }),
    );
  });
});
