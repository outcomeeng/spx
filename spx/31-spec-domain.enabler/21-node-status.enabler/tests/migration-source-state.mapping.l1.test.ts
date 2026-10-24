import { describe, expect, it } from "vitest";

import {
  NODE_STATUS_MALLEABILITY,
  NODE_STATUS_SOURCE_AUDIT_TAG_FORM,
  type NodeStatusMalleability,
  type NodeStatusSourceAuditTagForm,
  updateNodeStatus,
} from "@/lib/node-status";
import { SPEC_TREE_NODE_STATE } from "@/lib/spec-tree";
import {
  NODE_STATUS_TEST_GENERATOR,
  type SourceGrammarFixtureFacts,
} from "@testing/generators/node-status/node-status";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { migratingMethodologyConfig, withPinnedNodeRepository } from "@testing/harnesses/node-status/node-status";

const pathlessAuditTagForms: readonly NodeStatusSourceAuditTagForm[] = [
  NODE_STATUS_SOURCE_AUDIT_TAG_FORM.REVIEW,
  NODE_STATUS_SOURCE_AUDIT_TAG_FORM.AUDIT,
];

const malleabilities: readonly (NodeStatusMalleability | undefined)[] = [
  ...Object.values(NODE_STATUS_MALLEABILITY),
  undefined,
];
const { node, facts: drawn } = sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.sourceGrammarRepository());
const pairs: readonly SourceGrammarFixtureFacts[] = Object.values(NODE_STATUS_SOURCE_AUDIT_TAG_FORM).flatMap((
  auditTagForm,
) =>
  malleabilities.map((declaredMalleability): SourceGrammarFixtureFacts => ({
    auditTagForm,
    auditRuleSlug: drawn.auditRuleSlug,
    declaredMalleability,
  }))
);

describe("classification of a source-grammar node under a declaration migrating from 3.2, over every audit-tag form crossed with every declared malleability", () => {
  it("covers every audit-tag form crossed with every declared malleability", () => {
    expect(pairs).toHaveLength(Object.values(NODE_STATUS_SOURCE_AUDIT_TAG_FORM).length * malleabilities.length);
  });

  it.each(pairs.map((facts) => ({
    facts,
    expected: pathlessAuditTagForms.includes(facts.auditTagForm)
      ? SPEC_TREE_NODE_STATE.SPECIFIED
      : SPEC_TREE_NODE_STATE.PASSING,
  })))("$facts.auditTagForm × $facts.declaredMalleability → $expected", async ({ facts, expected }) => {
    await withPinnedNodeRepository(node, migratingMethodologyConfig(), async (repository) => {
      const subject = repository.subjectPaths[0] ?? "";
      await updateNodeStatus({
        productDir: repository.env.productDir,
        resolveOutcome: repository.passingOutcomes,
        resolveReadPaths: () => Promise.resolve([subject]),
        resolveAttributedResults: repository.passedAttributedResults([subject]),
        gitDependencies: repository.git,
      });
      await repository.commitAll();

      expect(await repository.readState(), JSON.stringify(facts)).toBe(expected);
    }, facts);
  });
});
