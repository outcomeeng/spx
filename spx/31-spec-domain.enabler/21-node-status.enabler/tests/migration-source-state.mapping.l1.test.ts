import { describe, expect, it } from "vitest";

import { NODE_STATUS_CLAIM_FIELD } from "@/lib/node-status";
import {
  migrationSourceStateCases,
  SOURCE_GRAMMAR_DECLARATION,
  SOURCE_GRAMMAR_TEST_GENERATOR,
} from "@testing/generators/node-status/source-grammar";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { withSourceGrammarNodeRepository } from "@testing/harnesses/node-status/source-grammar";
import { PROPERTY_L1_TEST_ENVELOPE_TIMEOUT_MS } from "@testing/harnesses/property/property";

describe("migration-source-state: a source-grammar node derives its State by the 4.0 rule", () => {
  it.each(migrationSourceStateCases())(
    "$auditTagForm at $declared: --update records and spx spec status reads $expected",
    async ({ auditTagForm, malleability, expected }) => {
      const fixture = sampleGeneratedValue(
        SOURCE_GRAMMAR_TEST_GENERATOR.nodeRepository({
          facts: { auditTagForm, malleability },
          declaration: SOURCE_GRAMMAR_DECLARATION.MIGRATING_FROM_THREE_TWO,
        }),
      );
      await withSourceGrammarNodeRepository(fixture, async (repository) => {
        await repository.updateAndCommit();
        expect(repository.readClaim()?.[NODE_STATUS_CLAIM_FIELD.STATE]).toBe(expected);
        expect(await repository.readState()).toBe(expected);
      });
    },
    PROPERTY_L1_TEST_ENVELOPE_TIMEOUT_MS,
  );
});
