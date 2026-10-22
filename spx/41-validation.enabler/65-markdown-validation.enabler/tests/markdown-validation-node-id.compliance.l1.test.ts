import { describe, expect, it } from "vitest";

import { SPEC_TREE_METHODOLOGY_LINE } from "@/lib/spec-tree/config";
import { validateMarkdown } from "@/validation/steps/markdown";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { markdownDirectoryTarget, markdownFileTarget } from "@testing/generators/validation/markdown";
import { arbitraryIdExcludedScenario } from "@testing/generators/validation/node-spec";
import { withMarkdownTempProject } from "@testing/harnesses/validation/markdown";
import { MARKDOWN_HARNESS_TIMEOUT } from "@testing/harnesses/with-markdown-env";

describe("Node spec id uniqueness", () => {
  it("is judged across every node spec under spx/ when a run validates only one spec file", async () => {
    const { excluded, validated } = sampleGeneratedValue(arbitraryIdExcludedScenario());
    await withMarkdownTempProject(async ({ productDir, write }) => {
      await write(excluded.path, excluded.content);
      const validatedFile = await write(validated.path, validated.content);

      const result = await validateMarkdown({ targets: [markdownFileTarget(validatedFile)], productDir });

      expect(result.success).toBe(false);
      expect(result.errors).toEqual([
        expect.objectContaining({
          file: validatedFile,
          line: validated.idLine,
          detail: expect.stringContaining(excluded.path),
        }),
      ]);
    }, SPEC_TREE_METHODOLOGY_LINE.FOUR_ZERO);
  }, MARKDOWN_HARNESS_TIMEOUT);

  it("counts the id of a spec listed in spx/EXCLUDE without reporting that spec itself", async () => {
    const { excluded, validated } = sampleGeneratedValue(arbitraryIdExcludedScenario());
    await withMarkdownTempProject(async ({ productDir, spxDir, write, writeNodeStatusExclude }) => {
      const excludedFile = await write(excluded.path, excluded.content);
      const validatedFile = await write(validated.path, validated.content);
      await writeNodeStatusExclude([excluded.nodeDirectory]);

      const result = await validateMarkdown({
        targets: [markdownDirectoryTarget(spxDir)],
        productDir,
        applyNodeStatusExcludes: true,
      });

      expect(result.success).toBe(false);
      expect(result.errors.map((error) => error.file)).not.toContain(excludedFile);
      expect(result.errors).toEqual([
        expect.objectContaining({
          file: validatedFile,
          line: validated.idLine,
          detail: expect.stringContaining(excluded.path),
        }),
      ]);
    }, SPEC_TREE_METHODOLOGY_LINE.FOUR_ZERO);
  }, MARKDOWN_HARNESS_TIMEOUT);
});
