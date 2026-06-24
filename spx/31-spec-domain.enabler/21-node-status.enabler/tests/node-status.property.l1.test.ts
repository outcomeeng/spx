import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  classifyNodeStatus,
  createNodeStatusFile,
  NODE_STATUS_EVIDENCE_OUTCOME,
  NODE_STATUS_FIELD,
  NODE_STATUS_SCHEMA_VERSION,
  NODE_STATUS_VERIFICATION_MECHANISM,
  parseNodeStatusFile,
  serializeNodeStatus,
} from "@/lib/node-status";
import { NODE_STATUS_TEST_GENERATOR, sampleNodeStatusValue } from "@testing/generators/node-status/node-status";

describe("node-status writer output", () => {
  it("always serializes to a schema-versioned JSON object with verification data", () => {
    fc.assert(
      fc.property(NODE_STATUS_TEST_GENERATOR.facts(), (facts) => {
        const parsed = parseNodeStatusFile(
          JSON.parse(serializeNodeStatus(createNodeStatusFile(facts.verification ?? {}))),
          "generated-status",
        );
        expect(parsed).toEqual({
          schemaVersion: 1,
          verification: facts.verification ?? {},
        });
      }),
    );
  });

  it("rejects nonconforming status JSON", () => {
    expect(() =>
      parseNodeStatusFile({ [NODE_STATUS_FIELD.SCHEMA_VERSION]: 2, [NODE_STATUS_FIELD.VERIFICATION]: {} }, "bad-status")
    ).toThrow(
      `${NODE_STATUS_FIELD.SCHEMA_VERSION} must be ${NODE_STATUS_SCHEMA_VERSION}`,
    );
    const invalidOutcome = sampleNodeStatusValue(fc.stringMatching(/^invalid-[a-z]{4}$/));
    expect(() =>
      parseNodeStatusFile({
        [NODE_STATUS_FIELD.SCHEMA_VERSION]: NODE_STATUS_SCHEMA_VERSION,
        [NODE_STATUS_FIELD.VERIFICATION]: {
          [NODE_STATUS_VERIFICATION_MECHANISM.TEST]: {
            [NODE_STATUS_FIELD.OVERALL]: NODE_STATUS_EVIDENCE_OUTCOME.PASSED,
            "tests/example.test.ts": invalidOutcome,
          },
        },
      }, "bad-status")
    ).toThrow(
      `${NODE_STATUS_FIELD.VERIFICATION}.${NODE_STATUS_VERIFICATION_MECHANISM.TEST}.tests/example.test.ts is invalid`,
    );
    expect(() =>
      parseNodeStatusFile({
        [NODE_STATUS_FIELD.SCHEMA_VERSION]: NODE_STATUS_SCHEMA_VERSION,
        [NODE_STATUS_FIELD.VERIFICATION]: {
          [NODE_STATUS_VERIFICATION_MECHANISM.TEST]: {
            [NODE_STATUS_FIELD.OVERALL]: NODE_STATUS_EVIDENCE_OUTCOME.PASSED,
            "tests/example.test.ts": NODE_STATUS_EVIDENCE_OUTCOME.FAILED,
          },
        },
      }, "bad-status")
    ).toThrow(`${NODE_STATUS_FIELD.VERIFICATION}.${NODE_STATUS_VERIFICATION_MECHANISM.TEST}.overall does not match`);
  });

  it("round-trips a non-scenario evidence reference", () => {
    const evidenceReference = "tests/node-status.property.l1.test.ts";
    const parsed = parseNodeStatusFile(
      createNodeStatusFile({
        [NODE_STATUS_VERIFICATION_MECHANISM.TEST]: {
          [NODE_STATUS_FIELD.OVERALL]: NODE_STATUS_EVIDENCE_OUTCOME.PASSED,
          [evidenceReference]: NODE_STATUS_EVIDENCE_OUTCOME.PASSED,
        },
      }),
      "property-status",
    );

    expect(parsed.verification.test?.[evidenceReference]).toBe(NODE_STATUS_EVIDENCE_OUTCOME.PASSED);
  });

  it("classifies deterministically: identical facts always map to the same state", () => {
    fc.assert(
      fc.property(NODE_STATUS_TEST_GENERATOR.facts(), (facts) => {
        expect(classifyNodeStatus(facts)).toBe(classifyNodeStatus(facts));
      }),
    );
  });
});
