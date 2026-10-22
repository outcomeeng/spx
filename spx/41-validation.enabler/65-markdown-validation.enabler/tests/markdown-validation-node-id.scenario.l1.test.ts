import { describe, expect, it } from "vitest";

import { SPEC_TREE_METHODOLOGY_LINE } from "@/lib/spec-tree/config";
import { validateMarkdown } from "@/validation/steps/markdown";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { markdownDirectoryTarget } from "@testing/generators/validation/markdown";
import {
  arbitraryIdAbsentScenario,
  arbitraryIdDuplicateScenario,
  arbitraryIdMalformedScenario,
  arbitraryPriorFormIdAbsentScenario,
} from "@testing/generators/validation/node-spec";
import { withMarkdownTempProject } from "@testing/harnesses/validation/markdown";
import { MARKDOWN_HARNESS_TIMEOUT } from "@testing/harnesses/with-markdown-env";

describe("Given a canonical-form node spec inside spx/ whose front matter carries no id", () => {
  it("reports an error naming the file", async () => {
    const { spec } = sampleGeneratedValue(arbitraryIdAbsentScenario());
    await withMarkdownTempProject(async ({ productDir, spxDir, write }) => {
      const specFile = await write(spec.path, spec.content);

      const result = await validateMarkdown({ targets: [markdownDirectoryTarget(spxDir)], productDir });

      expect(result.success).toBe(false);
      expect(result.errors).toEqual([expect.objectContaining({ file: specFile })]);
    }, SPEC_TREE_METHODOLOGY_LINE.FOUR_ZERO);
  }, MARKDOWN_HARNESS_TIMEOUT);
});

describe("Given a node spec inside spx/ whose id is not a UUIDv7 in canonical lowercase hyphenated form", () => {
  it("reports an error naming the file, the line of the id, and the value", async () => {
    const { spec, id } = sampleGeneratedValue(arbitraryIdMalformedScenario());
    await withMarkdownTempProject(async ({ productDir, spxDir, write }) => {
      const specFile = await write(spec.path, spec.content);

      const result = await validateMarkdown({ targets: [markdownDirectoryTarget(spxDir)], productDir });

      expect(result.success).toBe(false);
      expect(result.errors).toEqual([
        expect.objectContaining({ file: specFile, line: spec.idLine, detail: expect.stringContaining(id) }),
      ]);
    }, SPEC_TREE_METHODOLOGY_LINE.FOUR_ZERO);
  }, MARKDOWN_HARNESS_TIMEOUT);
});

describe("Given two node specs inside spx/ that carry one id", () => {
  it("reports an error for each spec naming the file, the line of the id, and the other spec's path", async () => {
    const { first, second } = sampleGeneratedValue(arbitraryIdDuplicateScenario());
    await withMarkdownTempProject(async ({ productDir, spxDir, write }) => {
      const firstFile = await write(first.path, first.content);
      const secondFile = await write(second.path, second.content);

      const result = await validateMarkdown({ targets: [markdownDirectoryTarget(spxDir)], productDir });

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ file: firstFile, line: first.idLine, detail: expect.stringContaining(second.path) }),
      );
      expect(result.errors).toContainEqual(
        expect.objectContaining({ file: secondFile, line: second.idLine, detail: expect.stringContaining(first.path) }),
      );
    }, SPEC_TREE_METHODOLOGY_LINE.FOUR_ZERO);
  }, MARKDOWN_HARNESS_TIMEOUT);
});

describe("Given a prior-form node spec with no id", () => {
  it("reports no error for the missing id", async () => {
    const { spec } = sampleGeneratedValue(arbitraryPriorFormIdAbsentScenario());
    await withMarkdownTempProject(async ({ productDir, spxDir, write }) => {
      await write(spec.path, spec.content);

      const result = await validateMarkdown({ targets: [markdownDirectoryTarget(spxDir)], productDir });

      expect(result.errors).toEqual([]);
      expect(result.success).toBe(true);
    });
  }, MARKDOWN_HARNESS_TIMEOUT);
});
