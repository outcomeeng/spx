import { describe, expect, it } from "vitest";

import { METHODOLOGY_CONFIG_FIELDS, METHODOLOGY_SECTION } from "@/config/methodology";
import { generatedMigratingMethodology } from "@testing/generators/config/descriptors";
import { sampleSpecTreeTestValue, SPEC_TREE_TEST_GENERATOR } from "@testing/generators/spec-tree/spec-tree";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import {
  contextShowEntries,
  contextShowFailure,
  documentAt,
  specTreeKindsConfig,
  withRichContextEnv,
  writeProductAndDecisionBody,
} from "@testing/harnesses/spec/context";

describe("spec context document content", () => {
  it("projects Full as the selected front matter and the complete body, and Digest as the same metadata and the opening paragraph", async () => {
    await withRichContextEnv(async (env, paths) => {
      const targeted = await contextShowEntries({ targets: [paths.targetId], cwd: env.productDir });
      const full = documentAt(targeted, paths.targetSpecPath);
      expect(full?.metadata).toEqual(paths.targetSelectedMetadata);
      expect(full?.content).toBe(paths.bodyText[paths.targetSpecPath]);
      const discovery = await contextShowEntries({ targets: [], cwd: env.productDir });
      const digest = documentAt(discovery, paths.targetSpecPath);
      expect(digest?.metadata).toEqual(paths.targetSelectedMetadata);
      expect(digest?.content).toBe(paths.openingText[paths.targetSpecPath]);
    });
  });

  it("selects the source-version first prose paragraph for a decision without its opening while a migration is open, and fails once it closes", async () => {
    const migrating = generatedMigratingMethodology();
    const paragraph = `Describes ${sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug())} in prose.\n`;
    // A title, a table the fallback must skip, then the first prose paragraph.
    const body = `# Title\n\n| a | b |\n| - | - |\n\n${paragraph}\nLater paragraph.\n`;
    await withSpecTreeEnv({ ...specTreeKindsConfig(), [METHODOLOGY_SECTION]: migrating.section }, async (env) => {
      const { decisionPath } = await writeProductAndDecisionBody(env, body);
      const entries = await contextShowEntries({ targets: [], cwd: env.productDir });
      expect(documentAt(entries, decisionPath)?.content).toBe(paragraph);
    });
    await withSpecTreeEnv({
      ...specTreeKindsConfig(),
      [METHODOLOGY_SECTION]: { [METHODOLOGY_CONFIG_FIELDS.VERSION]: migrating.target.text },
    }, async (env) => {
      const { decisionPath } = await writeProductAndDecisionBody(env, body);
      const failure = await contextShowFailure({ targets: [], cwd: env.productDir });
      expect(failure).toContain(decisionPath);
    });
  });
});
