import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { SPEC_TREE_METHODOLOGY_LINE } from "@/lib/spec-tree";
import { validateMarkdown } from "@/validation/steps/markdown";
import { LEADING_SLUG_DIAGNOSTICS } from "@/validation/steps/markdown-leading-slug-rule";
import { sampleGeneratedValue } from "@testing/generators/sample";
import {
  arbitraryDecisionRecordPath,
  repeatedSlugFileText,
  slugScopeNodeSpecPath,
  slugScopeUnjudgedFiles,
} from "@testing/generators/validation/leading-slug";
import { markdownDirectoryTarget } from "@testing/generators/validation/markdown";
import { withMarkdownTempProject } from "@testing/harnesses/validation/markdown";
import { MARKDOWN_HARNESS_TIMEOUT } from "@testing/harnesses/with-markdown-env";

function repeatErrors(errors: readonly { readonly file: string; readonly detail: string }[], file: string) {
  return errors.filter(({ file: errorFile, detail }) =>
    errorFile === file && detail.includes(LEADING_SLUG_DIAGNOSTICS.REPEATED)
  );
}

describe("slug-scope: the files markdown validation judges the leading slugs of", () => {
  it("judges a node spec and a decision record inside spx/ under a 4.0 declaration", async () => {
    const repeated = repeatedSlugFileText();
    const decisionPath = sampleGeneratedValue(arbitraryDecisionRecordPath());
    const nodeSpecPath = slugScopeNodeSpecPath();
    await withMarkdownTempProject(async ({ productDir, spxDir, write }) => {
      await write(decisionPath, repeated.text);
      await write(nodeSpecPath, repeated.text);

      const result = await validateMarkdown({ targets: [markdownDirectoryTarget(spxDir)], productDir });

      for (const path of [decisionPath, nodeSpecPath]) {
        expect(repeatErrors(result.errors, join(productDir, path))).toEqual([
          expect.objectContaining({ line: repeated.line, detail: expect.stringContaining(repeated.slug) }),
        ]);
      }
    }, SPEC_TREE_METHODOLOGY_LINE.FOUR_ZERO);
  }, MARKDOWN_HARNESS_TIMEOUT);

  it.each(slugScopeUnjudgedFiles())(
    "judges no leading slug of %s, %s",
    async (_kind, path) => {
      const repeated = repeatedSlugFileText();
      await withMarkdownTempProject(async ({ productDir, write }) => {
        await write(path, repeated.text);

        const result = await validateMarkdown({
          targets: [markdownDirectoryTarget(join(productDir, path, ".."))],
          productDir,
        });

        expect(repeatErrors(result.errors, join(productDir, path))).toEqual([]);
      }, SPEC_TREE_METHODOLOGY_LINE.FOUR_ZERO);
    },
    MARKDOWN_HARNESS_TIMEOUT,
  );

  it("judges no leading slug under a declaration that selects only the 3.x grammar", async () => {
    const repeated = repeatedSlugFileText();
    const decisionPath = sampleGeneratedValue(arbitraryDecisionRecordPath());
    await withMarkdownTempProject(async ({ productDir, spxDir, write }) => {
      await write(decisionPath, repeated.text);

      const result = await validateMarkdown({ targets: [markdownDirectoryTarget(spxDir)], productDir });

      expect(repeatErrors(result.errors, join(productDir, decisionPath))).toEqual([]);
    }, SPEC_TREE_METHODOLOGY_LINE.THREE_TWO);
  }, MARKDOWN_HARNESS_TIMEOUT);
});
