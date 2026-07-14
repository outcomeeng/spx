import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  classifyNodeStatus,
  createNodeStatusFile,
  NODE_STATUS_SCHEMA_VERSION,
  parseNodeStatusFile,
  serializeNodeStatus,
} from "@/lib/node-status";
import { NODE_STATUS_TEST_GENERATOR } from "@testing/generators/node-status/node-status";

export function registerNodeStatusPropertyEvidence(): void {
  describe("node-status writer output", () => {
    it("always serializes to a schema-versioned JSON object with verification data", () => {
      fc.assert(
        fc.property(NODE_STATUS_TEST_GENERATOR.facts(), (facts) => {
          const parsed = parseNodeStatusFile(
            JSON.parse(serializeNodeStatus(createNodeStatusFile(facts.verification ?? {}))),
            "generated-status",
          );
          expect(parsed).toEqual(createNodeStatusFile(facts.verification ?? {}));
        }),
      );
    });

    it("preserves every mechanism and evidence reference across parse and serialize", () => {
      fc.assert(
        fc.property(NODE_STATUS_TEST_GENERATOR.verification(), (verification) => {
          const serialized = serializeNodeStatus(createNodeStatusFile(verification));
          const parsed = parseNodeStatusFile(JSON.parse(serialized), "generated-status");

          expect(parsed).toEqual({
            schemaVersion: NODE_STATUS_SCHEMA_VERSION,
            verification,
          });
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
}
