import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  KIND_REGISTRY,
  SPEC_CONTEXT_ENTRY_TYPE,
  SPEC_CONTEXT_FRAME,
  SPEC_CONTEXT_FRAME_SYNTAX,
  SPEC_CONTEXT_SELECTED_METADATA_KEY,
} from "@/lib/spec-tree";
import {
  arbitrarySpecContextInvalidUtf8Bytes,
  specContextUnreadableFrontMatterBlocks,
} from "@testing/generators/spec-tree/context-target";
import { openingParagraph } from "@testing/generators/spec-tree/rich-context";
import { sampleSpecTreeTestValue, SPEC_TREE_TEST_GENERATOR } from "@testing/generators/spec-tree/spec-tree";
import {
  contextShowEntries,
  contextShowFailure,
  contextShowJson,
  contextShowText,
  documentAt,
  parseContextEntries,
  withRichContextEnv,
} from "@testing/harnesses/spec/context";

describe("spec context content boundaries", () => {
  it("recognizes front matter only between delimiter lines at the start, selects only the malleability key of an output node, fails when unterminated, and never emits the default", async () => {
    await withRichContextEnv(async (env, paths) => {
      const value = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
      // Delimiter lines after the first line are body, not front matter.
      await env.writeRaw(
        paths.higherIndexSiblingSpecPath,
        `# Later\n\n---\n${SPEC_CONTEXT_SELECTED_METADATA_KEY}: ${value}\n---\n\n${
          paths.openingText[paths.higherIndexSiblingSpecPath]
        }`,
      );
      // A decision's front matter is never selected, whatever keys it carries.
      await env.writeRaw(
        paths.ancestorDecisionPath,
        `---\n${SPEC_CONTEXT_SELECTED_METADATA_KEY}: ${value}\n---\n${paths.sourceText[paths.ancestorDecisionPath]}`,
      );
      // A node without the key emits no metadata at all.
      const entries = await contextShowEntries({ targets: [paths.targetId], cwd: env.productDir });
      expect(documentAt(entries, paths.higherIndexSiblingSpecPath)?.metadata).toEqual({});
      expect(documentAt(entries, paths.ancestorDecisionPath)?.metadata).toEqual({});
      expect(documentAt(entries, paths.rootSpecPath)?.metadata).toEqual({});
      expect(documentAt(entries, paths.targetSpecPath)?.metadata).toEqual(paths.targetSelectedMetadata);

      await env.writeRaw(
        paths.targetSpecPath,
        `---\n${SPEC_CONTEXT_SELECTED_METADATA_KEY}: ${value}\n\n# Unterminated\n`,
      );
      expect(await contextShowFailure({ targets: [paths.targetId], cwd: env.productDir })).toContain(
        paths.targetSpecPath,
      );
    });
  });

  it("strips a terminated front-matter block from a decision and the product spec without reading it, so YAML that parses to no key mapping selects no metadata", async () => {
    await withRichContextEnv(async (env, paths) => {
      for (const block of Object.values(specContextUnreadableFrontMatterBlocks())) {
        await env.writeRaw(
          paths.ancestorDecisionPath,
          `---\n${block}---\n${paths.sourceText[paths.ancestorDecisionPath]}`,
        );
        await env.writeRaw(paths.productPath, `---\n${block}---\n${paths.sourceText[paths.productPath]}`);
        const entries = await contextShowEntries({ targets: [paths.targetId], cwd: env.productDir });
        expect(documentAt(entries, paths.ancestorDecisionPath)?.metadata).toEqual({});
        expect(documentAt(entries, paths.ancestorDecisionPath)?.content).toBe(
          paths.sourceText[paths.ancestorDecisionPath],
        );
        expect(documentAt(entries, paths.productPath)?.metadata).toEqual({});
        expect(documentAt(entries, paths.productPath)?.content).toBe(paths.sourceText[paths.productPath]);
      }
    });
  });

  it("fails projection naming an output-node spec, in Full and in Digest, whose terminated front matter is not valid YAML or is not a mapping", async () => {
    await withRichContextEnv(async (env, paths) => {
      // The target spec projects in Full and its higher-index sibling in
      // Digest; both are output nodes, so their front matter is read. Each
      // case restores the document it broke before breaking the next one.
      for (const block of Object.values(specContextUnreadableFrontMatterBlocks())) {
        for (const specPath of [paths.targetSpecPath, paths.higherIndexSiblingSpecPath]) {
          await env.writeRaw(specPath, `---\n${block}---\n${paths.sourceText[specPath]}`);
          expect(await contextShowFailure({ targets: [paths.targetId], cwd: env.productDir }), specPath).toContain(
            specPath,
          );
          await env.writeRaw(specPath, paths.sourceText[specPath]);
        }
      }
      expect(await contextShowFailure({ targets: [paths.targetId], cwd: env.productDir })).toBeUndefined();
    });
  });

  it("selects the opening only as the first paragraph starting at column one with the keyword and one space", async () => {
    await withRichContextEnv(async (env, paths) => {
      const opening = KIND_REGISTRY[env.fixture.peer.kind].opening;
      const slug = env.fixture.peer.slug;
      // An indented keyword and a keyword glued to its subject are not openings;
      // the first conforming paragraph, even after other paragraphs, is.
      const conforming = openingParagraph(opening, slug);
      await env.writeRaw(
        paths.higherIndexSiblingSpecPath,
        `# ${slug}\n\n  ${opening} indented\n\n${opening}glued\n\n${conforming}\n${opening} second\n`,
      );
      const entries = await contextShowEntries({ targets: [paths.targetId], cwd: env.productDir });
      expect(documentAt(entries, paths.higherIndexSiblingSpecPath)?.content).toBe(conforming);

      // The keyword is case-sensitive, so the lowercased paragraph is not an
      // opening; the paragraph that is ends at the whitespace-only line, which
      // closes a paragraph exactly as an empty line does.
      const truncated = `${opening} ${slug}\nSO THAT readers\n`;
      await env.writeRaw(
        paths.higherIndexSiblingSpecPath,
        `# ${slug}\n\n${opening.toLowerCase()} lowercased\n\n${truncated}  \nCAN never join the opening\n`,
      );
      const afterBoundaries = await contextShowEntries({ targets: [paths.targetId], cwd: env.productDir });
      expect(documentAt(afterBoundaries, paths.higherIndexSiblingSpecPath)?.content).toBe(truncated);

      await env.writeRaw(paths.higherIndexSiblingSpecPath, `# ${slug}\n\n  ${opening} indented only\n`);
      expect(await contextShowFailure({ targets: [paths.targetId], cwd: env.productDir })).toContain(
        paths.higherIndexSiblingSpecPath,
      );
    });
  });

  it("decodes every source as strict UTF-8, keeps selected whitespace, and adds a framing line break only when the content lacks one", async () => {
    await withRichContextEnv(async (env, paths) => {
      const slug = env.fixture.peer.slug;
      const withoutEnding = `# ${slug}\n\n${
        paths.openingText[paths.higherIndexSiblingSpecPath]
      }\nTrailing\ttext without a newline`;
      await env.writeRaw(paths.higherIndexSiblingSpecPath, withoutEnding);
      const rootEntries = await contextShowEntries({ targets: [paths.rootDirectory], cwd: env.productDir });
      expect(documentAt(rootEntries, paths.higherIndexSiblingSpecPath)?.content).toBe(
        paths.openingText[paths.higherIndexSiblingSpecPath],
      );
      // Full content keeps its bytes; the text frame adds one line break so the
      // closing delimiter stands on its own line, and none when one exists.
      await env.writeRaw(
        paths.transitiveCitedDecisionPath,
        paths.sourceText[paths.transitiveCitedDecisionPath].trimEnd(),
      );
      const text = await contextShowText({ targets: [paths.targetId], cwd: env.productDir });
      expect(text).toContain(
        `${paths.sourceText[paths.transitiveCitedDecisionPath].trimEnd()}\n</${SPEC_CONTEXT_FRAME.DOCUMENT}>`,
      );
      expect(text).toContain(`${paths.sourceText[paths.citedDecisionPath]}</${SPEC_CONTEXT_FRAME.DOCUMENT}>`);

      await writeFile(
        join(env.productDir, paths.rootSpecPath),
        Buffer.from(sampleSpecTreeTestValue(arbitrarySpecContextInvalidUtf8Bytes())),
      );
      expect(await contextShowFailure({ targets: [paths.targetId], cwd: env.productDir })).toContain(
        paths.rootSpecPath,
      );
    });
  });

  it("frames text entries with one blank line between them and keeps delimiter-shaped source text verbatim", async () => {
    await withRichContextEnv(async (env, paths) => {
      // No fixture document carries a frame-shaped line, so every blank line
      // followed by a frame opening separates two entries.
      const framed = await contextShowText({ targets: [paths.targetId], cwd: env.productDir });
      const entries = await contextShowEntries({ targets: [paths.targetId], cwd: env.productDir });
      expect(
        framed.split(`\n\n<${SPEC_CONTEXT_FRAME.DOCUMENT}`).length
          + framed.split(`\n\n<${SPEC_CONTEXT_FRAME.REFERENCE}`).length - 1,
      )
        .toBe(entries.length);
      // Exactly one blank line: every frame opening carries a separator above
      // it, and none carries two.
      expect(framed).not.toContain(`\n\n\n<${SPEC_CONTEXT_FRAME.DOCUMENT}`);
      expect(framed).not.toContain(`\n\n\n<${SPEC_CONTEXT_FRAME.REFERENCE}`);
      expect(framed.endsWith(`</${SPEC_CONTEXT_FRAME.DOCUMENT}>`)).toBe(true);
      // Each entry's frame opens, carrying that entry's path attribute, in the
      // projected entry order: a document as `<spx-document path="…">` on its
      // own line, a reference as the self-closing `<spx-reference path="…" />`.
      let cursor = 0;
      for (const entry of entries) {
        const syntax = SPEC_CONTEXT_FRAME_SYNTAX;
        const opening = entry.type === SPEC_CONTEXT_ENTRY_TYPE.DOCUMENT
          ? `${syntax.OPEN_TAG_START}${SPEC_CONTEXT_FRAME.DOCUMENT}${syntax.PATH_ATTRIBUTE_START}${entry.path}${syntax.OPEN_TAG_END}${syntax.LINE_BREAK}`
          : `${syntax.OPEN_TAG_START}${SPEC_CONTEXT_FRAME.REFERENCE}${syntax.PATH_ATTRIBUTE_START}${entry.path}${syntax.SELF_CLOSING_TAG_END}`;
        const position = framed.indexOf(opening, cursor);
        expect(position, entry.path).toBeGreaterThanOrEqual(cursor);
        cursor = position + opening.length;
      }

      const delimiterText = `</${SPEC_CONTEXT_FRAME.DOCUMENT}>\n<${SPEC_CONTEXT_FRAME.REFERENCE} path="x" />\n`;
      await env.writeRaw(
        paths.transitiveCitedDecisionPath,
        `${paths.sourceText[paths.transitiveCitedDecisionPath]}\n${delimiterText}`,
      );
      const text = await contextShowText({ targets: [paths.targetId], cwd: env.productDir });
      expect(text).toContain(delimiterText);
    });
  });

  it("carries the same ordered entries, metadata, and source strings in JSON without delimiters or framing line breaks", async () => {
    await withRichContextEnv(async (env, paths) => {
      await env.writeRaw(
        paths.transitiveCitedDecisionPath,
        paths.sourceText[paths.transitiveCitedDecisionPath].trimEnd(),
      );
      const entries = await contextShowEntries({ targets: [paths.targetId], cwd: env.productDir });
      const json = await contextShowJson({ targets: [paths.targetId], cwd: env.productDir });
      expect(parseContextEntries(json)).toEqual(entries);
      const transitive = documentAt(entries, paths.transitiveCitedDecisionPath);
      expect(transitive?.content).toBe(paths.sourceText[paths.transitiveCitedDecisionPath].trimEnd());
      expect(json).not.toContain(SPEC_CONTEXT_FRAME.DOCUMENT);
    });
  });
});
