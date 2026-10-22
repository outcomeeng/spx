import { describe, expect, it } from "vitest";

import { SPEC_TREE_METHODOLOGY_LINE } from "@/lib/spec-tree/config";
import { validateMarkdown } from "@/validation/steps/markdown";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { markdownDirectoryTarget } from "@testing/generators/validation/markdown";
import {
  arbitraryRenderableScenario,
  renderableViolationCases,
} from "@testing/generators/validation/renderable-markdown";
import { withMarkdownTempProject } from "@testing/harnesses/validation/markdown";
import { MARKDOWN_HARNESS_TIMEOUT } from "@testing/harnesses/with-markdown-env";

describe("Context-renderable Markdown", () => {
  it(
    "fails validation, naming the offending file, for each clause of the context-renderable rule a file violates",
    async () => {
      const scenario = sampleGeneratedValue(arbitraryRenderableScenario());
      for (const { name, files, subject } of renderableViolationCases(scenario)) {
        await withMarkdownTempProject(async ({ productDir, spxDir, write }) => {
          const written = new Map<string, string>();
          for (const file of files) written.set(file.path, await write(file.path, file.content));

          const result = await validateMarkdown({ targets: [markdownDirectoryTarget(spxDir)], productDir });

          expect(result.success, name).toBe(false);
          expect(result.errors.map((error) => error.file), name).toContain(written.get(subject));
        }, SPEC_TREE_METHODOLOGY_LINE.FOUR_ZERO);
      }
    },
    MARKDOWN_HARNESS_TIMEOUT,
  );
});
