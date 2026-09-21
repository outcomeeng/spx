import { chmod, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { KIND_REGISTRY, SPEC_CONTEXT_FRAME, SPEC_CONTEXT_SELECTED_METADATA_KEY } from "@/lib/spec-tree";
import { arbitrarySpecContextInvalidUtf8Bytes } from "@testing/generators/spec-tree/context-target";
import { sampleSpecTreeTestValue, SPEC_TREE_TEST_GENERATOR } from "@testing/generators/spec-tree/spec-tree";
import {
  contextShowEntries,
  contextShowFailure,
  contextShowJson,
  contextShowText,
  documentAt,
  openingParagraph,
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
      expect(text).toContain(paths.targetIssuesPath);

      await writeFile(
        join(env.productDir, paths.rootSpecPath),
        Buffer.from(sampleSpecTreeTestValue(arbitrarySpecContextInvalidUtf8Bytes())),
      );
      expect(await contextShowFailure({ targets: [paths.targetId], cwd: env.productDir })).toContain(
        paths.rootSpecPath,
      );
    });
  });

  it("fails naming the exact path when a selected document cannot be read", async () => {
    await withRichContextEnv(async (env, paths) => {
      // Removing every permission bit makes the read fail on POSIX non-root
      // runners; restored afterwards so temp-directory cleanup stays quiet.
      await chmod(join(env.productDir, paths.rootSpecPath), 0o000);
      try {
        expect(await contextShowFailure({ targets: [paths.targetId], cwd: env.productDir })).toContain(
          paths.rootSpecPath,
        );
      } finally {
        await chmod(join(env.productDir, paths.rootSpecPath), 0o644);
      }
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
      expect(framed.endsWith(`</${SPEC_CONTEXT_FRAME.DOCUMENT}>`)).toBe(true);

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
