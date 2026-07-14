import { expect } from "vitest";

import {
  classifyNodeStatus,
  createNodeStatusFile,
  NODE_STATUS_FIELD,
  parseNodeStatusFile,
  serializeNodeStatus,
} from "@/lib/node-status";
import { NODE_STATUS_TEST_GENERATOR } from "@testing/generators/node-status/node-status";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

export function assertNodeStatusSerializationParses(): void {
  assertProperty(
    NODE_STATUS_TEST_GENERATOR.facts(),
    (facts) => {
      const verification = facts.verification ?? {};
      const parsed = parseNodeStatusFile(
        JSON.parse(serializeNodeStatus(createNodeStatusFile(verification))),
        "generated-status",
      );
      expect(parsed).toEqual({
        [NODE_STATUS_FIELD.SCHEMA_VERSION]: 1,
        [NODE_STATUS_FIELD.VERIFICATION]: verification,
      });
    },
    { level: PROPERTY_LEVEL.L1 },
  );
}

export function assertNodeStatusRoundTripPreservesVerification(): void {
  assertProperty(
    NODE_STATUS_TEST_GENERATOR.verification(),
    (verification) => {
      const serialized = serializeNodeStatus(createNodeStatusFile(verification));
      const parsed = parseNodeStatusFile(JSON.parse(serialized), "generated-status");

      expect(parsed).toEqual({
        [NODE_STATUS_FIELD.SCHEMA_VERSION]: 1,
        [NODE_STATUS_FIELD.VERIFICATION]: verification,
      });
    },
    { level: PROPERTY_LEVEL.L1 },
  );
}

export function assertNodeStatusClassificationIsDeterministic(): void {
  assertProperty(
    NODE_STATUS_TEST_GENERATOR.facts(),
    (facts) => {
      expect(classifyNodeStatus(facts)).toBe(classifyNodeStatus(facts));
    },
    { level: PROPERTY_LEVEL.L1 },
  );
}
