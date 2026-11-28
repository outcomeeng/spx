import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { SPEC_TREE_METHODOLOGY_LINE } from "@/lib/spec-tree";
import { validateMarkdown } from "@/validation/steps/markdown";
import { LEADING_SLUG_DIAGNOSTICS } from "@/validation/steps/markdown-leading-slug-rule";
import { leadingSlugErrorCases } from "@testing/generators/validation/leading-slug";
import { markdownDirectoryTarget } from "@testing/generators/validation/markdown";
import { withMarkdownTempProject } from "@testing/harnesses/validation/markdown";
import { MARKDOWN_HARNESS_TIMEOUT } from "@testing/harnesses/with-markdown-env";

describe("slug-errors: the errors markdown validation reports for the leading slugs of one file", () => {
  it.each(leadingSlugErrorCases().map((slugCase) => [slugCase.label, slugCase] as const))(
    "%s",
    async (_label, slugCase) => {
      await withMarkdownTempProject(async ({ productDir, spxDir, write }) => {
        for (const file of slugCase.files) await write(file.path, file.text);

        const result = await validateMarkdown({ targets: [markdownDirectoryTarget(spxDir)], productDir });

        const slugErrors = result.errors
          .filter(({ detail }) => Object.values(LEADING_SLUG_DIAGNOSTICS).some((diagnostic) => detail.includes(diagnostic)))
          .map(({ file, line, detail }) => ({ file, line, detail }));
        expect(slugErrors).toEqual(
          slugCase.files.flatMap((file) =>
            file.errors.map(({ line, slug }) => ({
              file: join(productDir, file.path),
              line,
              detail: expect.stringContaining(slug),
            }))
          ),
        );
      }, SPEC_TREE_METHODOLOGY_LINE.FOUR_ZERO);
    },
    MARKDOWN_HARNESS_TIMEOUT,
  );
});
