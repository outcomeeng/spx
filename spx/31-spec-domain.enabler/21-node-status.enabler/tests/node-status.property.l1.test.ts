import { describe, expect, it } from "vitest";

import {
  createNodeStatusFile,
  createNodeStatusMechanismRecord,
  NODE_STATUS_EVIDENCE_OUTCOME,
  NODE_STATUS_FIELD,
  NODE_STATUS_MECHANISM_OVERALL,
  NODE_STATUS_SCHEMA_VERSION,
  NODE_STATUS_VERIFICATION_MECHANISM,
  serializeNodeStatus,
} from "@/lib/node-status";
import { compareAsciiStrings } from "@/lib/state-store";
import { NODE_STATUS_TEST_GENERATOR } from "@testing/generators/node-status/node-status";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("every spx.status.json the writer produces", () => {
  it("parses as a schema-version-1 JSON object whose verification keys, overall values, and reference outcomes stay in the status vocabulary", () => {
    assertProperty(
      NODE_STATUS_TEST_GENERATOR.verificationOutcomes(),
      (verificationOutcomes) => {
        // The writer's record construction: each mechanism record carries the resolved
        // reference outcomes plus the overall the writer derives from them.
        const document = JSON.parse(
          serializeNodeStatus(
            createNodeStatusFile(
              Object.fromEntries(
                Object.entries(verificationOutcomes).map((
                  [mechanism, outcomes],
                ) => [mechanism, createNodeStatusMechanismRecord(outcomes)]),
              ),
            ),
          ),
        ) as {
          readonly [NODE_STATUS_FIELD.SCHEMA_VERSION]: unknown;
          readonly [NODE_STATUS_FIELD.VERIFICATION]: Readonly<Record<string, Readonly<Record<string, string>>>>;
        };

        expect(Object.keys(document).sort(compareAsciiStrings)).toEqual(
          [NODE_STATUS_FIELD.SCHEMA_VERSION, NODE_STATUS_FIELD.VERIFICATION].sort(compareAsciiStrings),
        );
        expect(document[NODE_STATUS_FIELD.SCHEMA_VERSION]).toBe(NODE_STATUS_SCHEMA_VERSION);
        expect(Object.keys(document[NODE_STATUS_FIELD.VERIFICATION]).sort(compareAsciiStrings)).toEqual(
          Object.keys(verificationOutcomes).sort(compareAsciiStrings),
        );
        for (const [mechanism, record] of Object.entries(document[NODE_STATUS_FIELD.VERIFICATION])) {
          expect(Object.values(NODE_STATUS_VERIFICATION_MECHANISM)).toContain(mechanism);
          expect(Object.values(NODE_STATUS_MECHANISM_OVERALL)).toContain(record[NODE_STATUS_FIELD.OVERALL]);
          expect(
            Object.fromEntries(Object.entries(record).filter(([key]) => key !== NODE_STATUS_FIELD.OVERALL)),
          ).toEqual(verificationOutcomes[mechanism as keyof typeof verificationOutcomes]);
          for (const [key, value] of Object.entries(record)) {
            if (key !== NODE_STATUS_FIELD.OVERALL) {
              expect(Object.values(NODE_STATUS_EVIDENCE_OUTCOME)).toContain(value);
            }
          }
        }
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
