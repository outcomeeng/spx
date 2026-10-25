import { describe, expect, it } from "vitest";

import { updateNodeStatus } from "@/lib/node-status";
import {
  enumerateSourceGrammarFixtureFacts,
  expectedSourceGrammarAuditKeys,
  NODE_STATUS_TEST_GENERATOR,
  NON_MIGRATING_SOURCE_GRAMMAR_EXPECTED_STATE,
  NON_MIGRATING_SOURCE_GRAMMAR_RECORDED_STATE,
  SOURCE_GRAMMAR_EXPECTED_STATE,
} from "@testing/generators/node-status/node-status";
import { sampleGeneratedValue } from "@testing/generators/sample";
import {
  migratingMethodologyConfig,
  nonMigratingMethodologyConfig,
  readClaimAuditKeys,
  readClaimState,
  withPinnedNodeRepository,
} from "@testing/harnesses/node-status/node-status";

const { node, facts: drawn } = sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.sourceGrammarRepository());
const cases = enumerateSourceGrammarFixtureFacts(drawn.auditRuleSlug);

describe("classification of a source-grammar node under a declaration migrating from 3.2, over every audit-tag form crossed with every declared malleability", () => {
  it.each(cases.map((facts) => ({ facts, expected: SOURCE_GRAMMAR_EXPECTED_STATE[facts.auditTagForm] })))(
    "$facts.auditTagForm × $facts.declaredMalleability → $expected",
    async ({ facts, expected }) => {
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
        expect(readClaimAuditKeys(repository.env.productDir, repository.nodePath), JSON.stringify(facts))
          .toEqual(expectedSourceGrammarAuditKeys(facts));
      }, facts);
    },
  );
});

describe("classification of a source-grammar node under a declaration on the 4.0 line with no migration source, over every audit-tag form crossed with every declared malleability", () => {
  it.each(cases.map((facts) => ({ facts, expected: NON_MIGRATING_SOURCE_GRAMMAR_EXPECTED_STATE[facts.auditTagForm] })))(
    "write path: $facts.auditTagForm × $facts.declaredMalleability keys no audit entry and derives $expected",
    async ({ facts, expected }) => {
      await withPinnedNodeRepository(node, nonMigratingMethodologyConfig(), async (repository) => {
        const subject = repository.subjectPaths[0] ?? "";
        await updateNodeStatus({
          productDir: repository.env.productDir,
          resolveOutcome: repository.passingOutcomes,
          resolveReadPaths: () => Promise.resolve([subject]),
          resolveAttributedResults: repository.passedAttributedResults([subject]),
          gitDependencies: repository.git,
        });
        await repository.commitAll();

        expect(readClaimAuditKeys(repository.env.productDir, repository.nodePath), JSON.stringify(facts)).toEqual([]);
        expect(readClaimState(repository.env.productDir, repository.nodePath), JSON.stringify(facts)).toBe(expected);
        expect(await repository.readState(), JSON.stringify(facts)).toBe(expected);
      }, facts);
    },
  );

  it.each(
    cases.map((facts) => ({
      facts,
      expected: NON_MIGRATING_SOURCE_GRAMMAR_EXPECTED_STATE[facts.auditTagForm],
      recorded: NON_MIGRATING_SOURCE_GRAMMAR_RECORDED_STATE[facts.auditTagForm],
    })),
  )(
    "read path: $facts.auditTagForm × $facts.declaredMalleability re-derives $expected from a committed claim recording $recorded with no audit entry",
    async ({ facts, expected, recorded }) => {
      await withPinnedNodeRepository(node, nonMigratingMethodologyConfig(), async (repository) => {
        await repository.writeClaim(repository.passedTestClaim(0), recorded);
        await repository.commitAll();

        expect(await repository.readState(), JSON.stringify(facts)).toBe(expected);
      }, facts);
    },
  );
});
