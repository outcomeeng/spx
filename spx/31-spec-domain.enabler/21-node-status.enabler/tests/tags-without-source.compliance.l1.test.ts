import { describe, expect, it } from "vitest";

import { NODE_STATUS_CLAIM_FIELD, NODE_STATUS_CLAIM_SECTION } from "@/lib/node-status";
import {
  auditTagText,
  SOURCE_GRAMMAR_AUDIT_TAG_FORM,
  SOURCE_GRAMMAR_DECLARATION,
  SOURCE_GRAMMAR_TEST_GENERATOR,
  type SourceGrammarNodeRepositoryFixture,
  taggedAssertionLines,
  tagsWithoutSourceCases,
} from "@testing/generators/node-status/source-grammar";
import { sampleGeneratedValue } from "@testing/generators/sample";
import {
  specTextWithAssertionLines,
  withSourceGrammarNodeRepository,
} from "@testing/harnesses/node-status/source-grammar";
import { PROPERTY_L1_TEST_ENVELOPE_TIMEOUT_MS } from "@testing/harnesses/property/property";

type FoldObservation = {
  readonly auditKeys: readonly string[];
  readonly recorded: unknown;
  readonly read: unknown;
};

/** The claim's audit keys and recorded State, and the State spx spec status reads, after --update folds `specText`. */
async function foldUnder(fixture: SourceGrammarNodeRepositoryFixture, specText: string): Promise<FoldObservation> {
  let observed: FoldObservation | undefined;
  await withSourceGrammarNodeRepository(fixture, async (repository) => {
    await repository.updateAndCommit();
    const claim = repository.readClaim();
    observed = {
      auditKeys: Object.keys(claim?.[NODE_STATUS_CLAIM_FIELD.VERIFICATION][NODE_STATUS_CLAIM_SECTION.AUDIT] ?? {}),
      recorded: claim?.[NODE_STATUS_CLAIM_FIELD.STATE],
      read: await repository.readState(),
    };
  }, specText);
  if (observed === undefined) throw new Error("the repository callback did not run");
  return observed;
}

describe("tags-unread-without-source: under 4.0 alone, an audit or review tag keys no entry and changes no State", () => {
  it.each(tagsWithoutSourceCases())(
    "a $spelling tag at $declared keys no audit entry and the node derives the State it derives with no tag",
    async ({ spelling, malleability }) => {
      const fixture = sampleGeneratedValue(
        SOURCE_GRAMMAR_TEST_GENERATOR.nodeRepository({
          facts: { auditTagForm: SOURCE_GRAMMAR_AUDIT_TAG_FORM.NONE, malleability },
          declaration: SOURCE_GRAMMAR_DECLARATION.FOUR_ZERO,
        }),
      );

      const tagged = await foldUnder(
        fixture,
        specTextWithAssertionLines(
          fixture.node,
          taggedAssertionLines(auditTagText(spelling, fixture.node.auditSlug)),
        ),
      );
      const untagged = await foldUnder(fixture, specTextWithAssertionLines(fixture.node, []));

      expect(tagged.auditKeys).toHaveLength(0);
      expect(tagged.recorded).toBe(untagged.recorded);
      expect(tagged.read).toBe(untagged.read);
    },
    PROPERTY_L1_TEST_ENVELOPE_TIMEOUT_MS,
  );
});
