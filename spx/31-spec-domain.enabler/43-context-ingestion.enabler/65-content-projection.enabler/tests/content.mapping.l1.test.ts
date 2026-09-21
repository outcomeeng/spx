import { describe, expect, it } from "vitest";

import {
  DECISION_KINDS,
  KIND_REGISTRY,
  NODE_KINDS,
  SPEC_CONTEXT_DOCUMENT_OPENING,
  SPEC_TREE_GRAMMAR,
} from "@/lib/spec-tree";
import { sampleSpecTreeTestValue, SPEC_TREE_TEST_GENERATOR } from "@testing/generators/spec-tree/spec-tree";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import {
  contextShowEntries,
  contextShowFailure,
  documentAt,
  rootedSpecPath,
  specTreeKindsConfig,
} from "@testing/harnesses/spec/context";

describe("spec context Digest openings", () => {
  it.each(NODE_KINDS)("maps a %s node to the kind registry's opening keyword and fails without it", async (kind) => {
    await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
      await env.materialize();
      const opening = KIND_REGISTRY[kind].opening;
      const order = Math.max(env.fixture.root.order, env.fixture.peer.order) + 1;
      const slug = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
      const specPath = rootedSpecPath(`${order}-${slug}${KIND_REGISTRY[kind].suffix}/${slug}.md`);
      const paragraph = `${opening} ${slug}\nSO THAT the registry keyword\nCAN be selected\n`;
      await env.writeRaw(specPath, `# ${slug}\n\n${paragraph}\nA later paragraph.\n`);
      const entries = await contextShowEntries({ targets: [], cwd: env.productDir });
      expect(documentAt(entries, specPath)?.content).toBe(paragraph);
      // Without the keyword the projection fails naming the document; a title
      // never stands in for the opening.
      await env.writeRaw(specPath, `# ${slug}\n\nA paragraph without the keyword.\n`);
      expect(await contextShowFailure({ targets: [], cwd: env.productDir })).toContain(specPath);
    });
  });

  it.each(DECISION_KINDS)(
    "maps a %s decision to the methodology-fixed GOVERNS opening and fails without it",
    async (kind) => {
      await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
        await env.materialize();
        const slug = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
        const decisionPath = rootedSpecPath(`${env.fixture.peer.order + 1}-${slug}${KIND_REGISTRY[kind].suffix}`);
        const paragraph = `${SPEC_CONTEXT_DOCUMENT_OPENING.DECISION} ${slug}\n`;
        await env.writeRaw(decisionPath, `# ${slug}\n\n${paragraph}\n## Rationale\n\nBecause.\n`);
        const entries = await contextShowEntries({ targets: [], cwd: env.productDir });
        expect(documentAt(entries, decisionPath)?.content).toBe(paragraph);
        await env.writeRaw(decisionPath, `# ${slug}\n\nA paragraph without the keyword.\n`);
        expect(await contextShowFailure({ targets: [], cwd: env.productDir })).toContain(decisionPath);
      });
    },
  );

  it("maps the product to the methodology-fixed OFFERS opening in its Full projection", async () => {
    await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
      await env.materialize();
      const snapshot = await env.readFilesystemSnapshot();
      const productPath = snapshot.product?.ref?.path;
      if (productPath === undefined) throw new Error("Expected the fixture to expose a product spec");
      const entries = await contextShowEntries({ targets: [], cwd: env.productDir });
      expect(documentAt(entries, productPath)?.content).toContain(`${SPEC_CONTEXT_DOCUMENT_OPENING.PRODUCT} `);
      expect(productPath.endsWith(SPEC_TREE_GRAMMAR.PRODUCT_SUFFIX)).toBe(true);
    });
  });
});
