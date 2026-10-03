import { describe, expect, it } from "vitest";

import { defaultContextFileSystem } from "@/commands/spec/context-input";
import { METHODOLOGY_SECTION } from "@/config/methodology";
import { DECISION_KINDS, KIND_REGISTRY, NODE_KINDS, type SpecContextKindRegistry } from "@/lib/spec-tree";
import {
  generatedMethodologyVersionFormSections,
  generatedMigratingMethodology,
} from "@testing/generators/config/descriptors";
import {
  decisionStatementParagraph,
  freeDecisionPath,
  freeNodeSpecPath,
  openingParagraph,
} from "@testing/generators/spec-tree/rich-context";
import { sampleSpecTreeTestValue, SPEC_TREE_TEST_GENERATOR } from "@testing/generators/spec-tree/spec-tree";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import {
  contextShowEntries,
  documentAt,
  specTreeKindsConfig,
  withRichContextEnv,
} from "@testing/harnesses/spec/context";

describe("spec context Digest paragraphs", () => {
  it.each(NODE_KINDS)("maps a %s node to the paragraph its kind registry's opening keyword opens", async (kind) => {
    await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
      await env.materialize();
      const slug = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
      const specPath = freeNodeSpecPath(env.fixture, kind, slug);
      const opening = openingParagraph(KIND_REGISTRY[kind].opening, slug);
      // Every other kind's opening and a prose paragraph precede this kind's
      // opening, so only the keyword the registry resolves for this kind can
      // select the expected paragraph.
      const otherOpenings = NODE_KINDS.filter((other) => other !== kind).map((other) =>
        openingParagraph(KIND_REGISTRY[other].opening, slug)
      );
      await env.writeRaw(
        specPath,
        `# ${slug}\n\n${
          [...otherOpenings, decisionStatementParagraph(slug), opening].join("\n")
        }\nA later paragraph.\n`,
      );
      const entries = await contextShowEntries({ targets: [], cwd: env.productDir });
      expect(documentAt(entries, specPath)?.content).toBe(opening);
    });
  });

  it.each(NODE_KINDS)(
    "maps a %s node to the paragraph the given kind registry's keyword opens, not the static registry's",
    async (kind) => {
      await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
        await env.materialize();
        // The given registry rotates the openings across node kinds, so each
        // kind resolves another kind's keyword and the static keyword for this
        // kind selects a different paragraph than the given one.
        const registry = Object.fromEntries(
          NODE_KINDS.map((each, index) => [
            each,
            { opening: KIND_REGISTRY[NODE_KINDS[(index + 1) % NODE_KINDS.length]].opening },
          ]),
        ) as SpecContextKindRegistry;
        const keyword = registry[kind]?.opening;
        expect(keyword).not.toBe(KIND_REGISTRY[kind].opening);
        const slug = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
        // Every fixture node spec carries every kind's opening, so each one
        // resolves a Digest under the rotated registry as well.
        for (const node of (await env.readFilesystemSnapshot()).allNodes) {
          if (node.ref?.path === undefined) continue;
          await env.writeRaw(
            node.ref.path,
            `# ${node.slug}\n\n${
              NODE_KINDS.map((each) => openingParagraph(KIND_REGISTRY[each].opening, node.slug)).join("\n")
            }`,
          );
        }
        const specPath = freeNodeSpecPath(env.fixture, kind, slug);
        const opening = openingParagraph(String(keyword), slug);
        const otherOpenings = NODE_KINDS.map((other) => KIND_REGISTRY[other].opening)
          .filter((other) => other !== keyword)
          .map((other) => openingParagraph(other, slug));
        await env.writeRaw(specPath, `# ${slug}\n\n${[...otherOpenings, opening].join("\n")}`);
        const entries = await contextShowEntries({
          targets: [],
          cwd: env.productDir,
          fileSystem: { ...defaultContextFileSystem, resolveKindRegistry: async () => ({ ok: true, value: registry }) },
        });
        expect(documentAt(entries, specPath)?.content).toBe(opening);
      });
    },
  );

  it.each(DECISION_KINDS)(
    "maps a %s decision to its decision statement under every methodology version declaration",
    async (kind) => {
      // Each accepted version form, and an open migration whose source differs
      // from its target: the statement is selected the same way under each.
      const sections = [
        ...Object.values(generatedMethodologyVersionFormSections().sections),
        generatedMigratingMethodology().section,
      ];
      for (const section of sections) {
        await withSpecTreeEnv({ ...specTreeKindsConfig(), [METHODOLOGY_SECTION]: section }, async (env) => {
          await env.materialize();
          const slug = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
          const decisionPath = freeDecisionPath(env.fixture, kind, slug);
          const statement = decisionStatementParagraph(slug);
          await env.writeRaw(decisionPath, `# ${slug}\n\n${statement}\n## Rationale\n\nBecause.\n`);
          const entries = await contextShowEntries({ targets: [], cwd: env.productDir });
          expect(documentAt(entries, decisionPath)?.content, JSON.stringify(section)).toBe(statement);
        });
      }
    },
  );

  it("maps a projected product document to Full wherever it is projected and never to a Digest", async () => {
    await withRichContextEnv(async (env, paths) => {
      // Wherever the product is projected it carries its complete source; no
      // call renders it as an opening paragraph.
      for (
        const targets of [[], [paths.targetId], [paths.rootDirectory]]
      ) {
        const entries = await contextShowEntries({ targets, cwd: env.productDir });
        expect(documentAt(entries, paths.productPath)?.content, JSON.stringify(targets))
          .toBe(paths.sourceText[paths.productPath]);
      }
    });
  });
});
