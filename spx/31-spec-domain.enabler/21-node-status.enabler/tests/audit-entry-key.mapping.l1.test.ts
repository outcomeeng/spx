import { describe, expect, it } from "vitest";

import { NODE_STATUS_CLAIM_FIELD, NODE_STATUS_CLAIM_SECTION } from "@/lib/node-status";
import {
  auditEntryKeyCases,
  SOURCE_GRAMMAR_AUDIT_TAG_FORM,
  SOURCE_GRAMMAR_DECLARATION,
  SOURCE_GRAMMAR_TEST_GENERATOR,
} from "@testing/generators/node-status/source-grammar";
import { sampleGeneratedValue } from "@testing/generators/sample";
import {
  specTextWithAssertionLines,
  withSourceGrammarNodeRepository,
} from "@testing/harnesses/node-status/source-grammar";
import { PROPERTY_L1_TEST_ENVELOPE_TIMEOUT_MS } from "@testing/harnesses/property/property";

describe("audit-entry-key: spx spec status --update keys one audit entry per keyed audit reference", () => {
  const fixture = sampleGeneratedValue(
    SOURCE_GRAMMAR_TEST_GENERATOR.nodeRepository({
      facts: { auditTagForm: SOURCE_GRAMMAR_AUDIT_TAG_FORM.NONE, malleability: undefined },
      declaration: SOURCE_GRAMMAR_DECLARATION.MIGRATING_FROM_THREE_TWO,
    }),
  );

  it.each(auditEntryKeyCases(fixture.node.auditSlug))(
    "$label: the node's 4.0 claim holds an audit entry under each expected key and no other",
    async ({ assertionLines, expectedKeys }) => {
      await withSourceGrammarNodeRepository(fixture, async (repository) => {
        await repository.updateAndCommit();
        const audit = repository.readClaim()?.[NODE_STATUS_CLAIM_FIELD.VERIFICATION][NODE_STATUS_CLAIM_SECTION.AUDIT];
        expect(Object.keys(audit ?? {})).toEqual(expectedKeys);
      }, specTextWithAssertionLines(fixture.node, assertionLines));
    },
    PROPERTY_L1_TEST_ENVELOPE_TIMEOUT_MS,
  );
});
