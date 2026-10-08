import { describe, expect, it } from "vitest";

import {
  NODE_STATUS_EVIDENCE_OUTCOME,
  NODE_STATUS_FIELD,
  NODE_STATUS_MECHANISM_OVERALL,
  NODE_STATUS_SCHEMA_VERSION,
  NODE_STATUS_VERIFICATION_MECHANISM,
  updateNodeStatus,
} from "@/lib/node-status";
import { compareAsciiStrings } from "@/lib/state-store";
import { NODE_STATUS_TEST_GENERATOR } from "@testing/generators/node-status/node-status";
import { readNodeStatusFileBytes, withStatusWriterTree } from "@testing/harnesses/node-status/node-status";
import {
  assertProperty,
  PROPERTY_CLASSIFICATION,
  propertyTestEnvelopeTimeoutMs,
} from "@testing/harnesses/property/property";

describe("every spx.status.json the writer produces", () => {
  it(
    "parses as a schema-version-1 JSON object whose verification keys, overall values, and reference outcomes stay in the status vocabulary and whose references are the node's linked evidence",
    async () => {
      await assertProperty(
        NODE_STATUS_TEST_GENERATOR.statusWriterTree(),
        async (fixture) => {
          await withStatusWriterTree(fixture, async ({ env, expectations, resolveOutcome }) => {
            await updateNodeStatus({ productDir: env.productDir, resolveOutcome });

            const written = await readNodeStatusFileBytes(env.productDir);
            expect(Object.keys(written).sort(compareAsciiStrings)).toEqual(
              expectations.map((expectation) => expectation.statusPath).sort(compareAsciiStrings),
            );

            for (const expectation of expectations) {
              const document: unknown = JSON.parse(String(written[expectation.statusPath]));
              expect(document).toBeTypeOf("object");
              expect(Array.isArray(document)).toBe(false);
              const fields = document as Readonly<Record<string, unknown>>;
              expect(Object.keys(fields).sort(compareAsciiStrings)).toEqual(
                [NODE_STATUS_FIELD.SCHEMA_VERSION, NODE_STATUS_FIELD.VERIFICATION].sort(compareAsciiStrings),
              );
              expect(fields[NODE_STATUS_FIELD.SCHEMA_VERSION]).toBe(NODE_STATUS_SCHEMA_VERSION);

              const verification = fields[NODE_STATUS_FIELD.VERIFICATION] as Readonly<
                Record<string, Readonly<Record<string, unknown>>>
              >;
              expect(Object.keys(verification)).toEqual(
                expectation.evidencePaths.length === 0 ? [] : [NODE_STATUS_VERIFICATION_MECHANISM.TEST],
              );
              const references: string[] = [];
              for (const [mechanism, record] of Object.entries(verification)) {
                expect(Object.values(NODE_STATUS_VERIFICATION_MECHANISM)).toContain(mechanism);
                expect(Object.values(NODE_STATUS_MECHANISM_OVERALL)).toContain(record[NODE_STATUS_FIELD.OVERALL]);
                for (const [reference, outcome] of Object.entries(record)) {
                  if (reference === NODE_STATUS_FIELD.OVERALL) continue;
                  expect(Object.values(NODE_STATUS_EVIDENCE_OUTCOME)).toContain(outcome);
                  references.push(reference);
                }
              }
              expect(references.sort(compareAsciiStrings)).toEqual(
                [...expectation.evidencePaths].sort(compareAsciiStrings),
              );
            }
          });
        },
        PROPERTY_CLASSIFICATION.SMALL_L1,
      );
    },
    propertyTestEnvelopeTimeoutMs(PROPERTY_CLASSIFICATION.SMALL_L1),
  );
});
