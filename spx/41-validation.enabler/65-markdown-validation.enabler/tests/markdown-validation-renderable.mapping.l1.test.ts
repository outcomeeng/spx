import { describe, expect, it } from "vitest";

import { SPEC_TREE_METHODOLOGY_LINE } from "@/lib/spec-tree/config";
import { validateMarkdown } from "@/validation/steps/markdown";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { markdownDirectoryTarget } from "@testing/generators/validation/markdown";
import {
  arbitraryRenderableScenario,
  renderableAdmittedCases,
} from "@testing/generators/validation/renderable-markdown";
import { withMarkdownTempProject } from "@testing/harnesses/validation/markdown";
import { MARKDOWN_HARNESS_TIMEOUT } from "@testing/harnesses/with-markdown-env";

describe("Context-renderable Markdown openings and decision statements", () => {
  it(
    "map a product spec to no required opening, each ADR and PDR with a decision statement to no error, and each output-node spec to the opening resolved from its kind or parent kind",
    async () => {
      const scenario = sampleGeneratedValue(arbitraryRenderableScenario());
      for (const { name, files } of renderableAdmittedCases(scenario)) {
        await withMarkdownTempProject(async ({ productDir, spxDir, write }) => {
          for (const file of files) await write(file.path, file.content);

          const result = await validateMarkdown({ targets: [markdownDirectoryTarget(spxDir)], productDir });

          expect(result.errors, name).toEqual([]);
          expect(result.success, name).toBe(true);
        }, SPEC_TREE_METHODOLOGY_LINE.FOUR_ZERO);
      }
    },
    MARKDOWN_HARNESS_TIMEOUT,
  );
});
