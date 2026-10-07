import { describe, expect, it } from "vitest";

import {
  createNodeStatusFile,
  NODE_STATUS_EVIDENCE_OUTCOME,
  NODE_STATUS_FIELD,
  NODE_STATUS_MECHANISM_OVERALL,
  NODE_STATUS_SCHEMA_VERSION,
  NODE_STATUS_VERIFICATION_MECHANISM,
  serializeNodeStatus,
} from "@/lib/node-status";
import { NODE_STATUS_TEST_GENERATOR } from "@testing/generators/node-status/node-status";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("every spx.status.json the writer produces", () => {
  it("parses as a schema-version-1 JSON object whose verification keys, overall values, and reference outcomes stay in the status vocabulary", () => {
    assertProperty(
      NODE_STATUS_TEST_GENERATOR.verification(),
      (verification) => {
        const document = JSON.parse(serializeNodeStatus(createNodeStatusFile(verification))) as {
          readonly [NODE_STATUS_FIELD.VERIFICATION]: Readonly<Record<string, Readonly<Record<string, string>>>>;
        };

        expect(document).toEqual({
          [NODE_STATUS_FIELD.SCHEMA_VERSION]: NODE_STATUS_SCHEMA_VERSION,
          [NODE_STATUS_FIELD.VERIFICATION]: verification,
        });
        for (const [mechanism, record] of Object.entries(document[NODE_STATUS_FIELD.VERIFICATION])) {
          expect(Object.values(NODE_STATUS_VERIFICATION_MECHANISM)).toContain(mechanism);
          for (const [key, value] of Object.entries(record)) {
            expect(
              key === NODE_STATUS_FIELD.OVERALL
                ? Object.values(NODE_STATUS_MECHANISM_OVERALL)
                : Object.values(NODE_STATUS_EVIDENCE_OUTCOME),
            ).toContain(value);
          }
        }
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
