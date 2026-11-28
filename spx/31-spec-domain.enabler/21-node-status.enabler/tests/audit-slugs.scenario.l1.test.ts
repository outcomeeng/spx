import { describe, expect, it } from "vitest";

import {
  NODE_STATUS_CLAIM_FIELD,
  NODE_STATUS_CLAIM_SECTION,
  NODE_STATUS_EVIDENCE_OUTCOME,
  NODE_STATUS_MALLEABILITY,
} from "@/lib/node-status";
import { SPEC_TREE_NODE_STATE } from "@/lib/spec-tree";
import {
  SOURCE_GRAMMAR_AUDIT_TAG_FORM,
  SOURCE_GRAMMAR_DECLARATION,
  SOURCE_GRAMMAR_TEST_GENERATOR,
} from "@testing/generators/node-status/source-grammar";
import { sampleGeneratedValue } from "@testing/generators/sample";
import {
  sourceGrammarTestReference,
  specTextWithAssertionLines,
  withSourceGrammarNodeRepository,
} from "@testing/harnesses/node-status/source-grammar";
import { PROPERTY_L1_TEST_ENVELOPE_TIMEOUT_MS } from "@testing/harnesses/property/property";

describe("tag-outside-assertion", () => {
  it(
    "keys only the audit tag of an Assertion row, and none in a code span or after the Assertions section",
    async () => {
      const fixture = sampleGeneratedValue(
        SOURCE_GRAMMAR_TEST_GENERATOR.nodeRepository({
          facts: {
            auditTagForm: SOURCE_GRAMMAR_AUDIT_TAG_FORM.NONE,
            malleability: NODE_STATUS_MALLEABILITY.IMPLEMENTATION,
          },
          declaration: SOURCE_GRAMMAR_DECLARATION.MIGRATING_FROM_THREE_TWO,
        }),
      );
      const scenario = sampleGeneratedValue(SOURCE_GRAMMAR_TEST_GENERATOR.tagOutsideAssertion());
      const specText = specTextWithAssertionLines(fixture.node, scenario.assertionLines, scenario.trailingLines);
      await withSourceGrammarNodeRepository(fixture, async (repository) => {
        await repository.updateAndCommit();
        const audit = repository.readClaim()?.[NODE_STATUS_CLAIM_FIELD.VERIFICATION][NODE_STATUS_CLAIM_SECTION.AUDIT];
        expect(Object.keys(audit ?? {})).toEqual([scenario.keyedSlug]);
      }, specText);
    },
    PROPERTY_L1_TEST_ENVELOPE_TIMEOUT_MS,
  );
});

describe("source-node-without-evidence-audit", () => {
  it(
    "reads a source-grammar node that declares no Malleability and whose claim lacks an evidence entry as not passing",
    async () => {
      const fixture = sampleGeneratedValue(
        SOURCE_GRAMMAR_TEST_GENERATOR.nodeRepository({
          facts: { auditTagForm: SOURCE_GRAMMAR_AUDIT_TAG_FORM.NONE, malleability: undefined },
          declaration: SOURCE_GRAMMAR_DECLARATION.MIGRATING_FROM_THREE_TWO,
        }),
      );
      await withSourceGrammarNodeRepository(fixture, async (repository) => {
        const commit = await repository.headCommit();
        await repository.commitClaim({
          [NODE_STATUS_CLAIM_SECTION.TEST]: {
            [sourceGrammarTestReference(fixture.node)]: {
              [NODE_STATUS_CLAIM_FIELD.VERDICT]: NODE_STATUS_EVIDENCE_OUTCOME.PASSED,
              [NODE_STATUS_CLAIM_FIELD.COMMIT]: commit,
              [NODE_STATUS_CLAIM_FIELD.READ]: [repository.specPath, repository.testPath, repository.subjectPath],
            },
          },
        }, SPEC_TREE_NODE_STATE.PASSING);

        expect(await repository.readState()).not.toBe(SPEC_TREE_NODE_STATE.PASSING);
      });
    },
    PROPERTY_L1_TEST_ENVELOPE_TIMEOUT_MS,
  );
});
