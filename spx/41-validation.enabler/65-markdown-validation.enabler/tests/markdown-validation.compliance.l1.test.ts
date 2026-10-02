import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { allCommand } from "@/commands/validation/all";
import { markdownCommand } from "@/commands/validation/markdown";
import { getDefaultDirectories } from "@/validation/steps/markdown";
import { MARKDOWN_VALIDATION_DATA } from "@testing/generators/validation/markdown";
import { withMarkdownTempProject, writeMarkdownFile } from "@testing/harnesses/validation/markdown";
import { MARKDOWN_HARNESS_TIMEOUT } from "@testing/harnesses/with-markdown-env";

describe("ALWAYS: broken links fail spx validation all", () => {
  it("fails the full pipeline when a spec-tree markdown file carries a broken link", async () => {
    await withMarkdownTempProject(async ({ productDir, spxDir, writeValidMarkdownPair }) => {
      await writeValidMarkdownPair(spxDir);
      await writeMarkdownFile(
        join(spxDir, MARKDOWN_VALIDATION_DATA.brokenMarkdownFile),
        MARKDOWN_VALIDATION_DATA.brokenMarkdownContent,
      );

      const result = await allCommand({ cwd: productDir, quiet: true });

      expect(result.exitCode).toBe(MARKDOWN_VALIDATION_DATA.one);
    });
  }, MARKDOWN_HARNESS_TIMEOUT);

  it("passes the full pipeline when the same markdown carries no broken link", async () => {
    await withMarkdownTempProject(async ({ productDir, spxDir, writeValidMarkdownPair }) => {
      await writeValidMarkdownPair(spxDir);

      const result = await allCommand({ cwd: productDir, quiet: true });

      expect(result.exitCode).toBe(MARKDOWN_VALIDATION_DATA.zero);
    });
  }, MARKDOWN_HARNESS_TIMEOUT);
});

describe("NEVER: validate directories outside spx/ and docs/ by default", () => {
  it("leaves a broken markdown file outside spx/ and docs/ unvalidated", async () => {
    await withMarkdownTempProject(async ({ docsDir, productDir, spxDir, writeValidMarkdownPair }) => {
      await writeValidMarkdownPair(spxDir);
      await writeValidMarkdownPair(docsDir);
      await writeMarkdownFile(
        join(
          productDir,
          MARKDOWN_VALIDATION_DATA.outsideDefaultDirectoryName,
          MARKDOWN_VALIDATION_DATA.outsideDefaultBrokenFile,
        ),
        MARKDOWN_VALIDATION_DATA.brokenMarkdownContent,
      );

      const result = await markdownCommand({ cwd: productDir });

      expect(getDefaultDirectories(productDir)).toEqual([spxDir, docsDir]);
      expect(result.output).not.toContain(MARKDOWN_VALIDATION_DATA.outsideDefaultBrokenFile);
      expect(result.exitCode).toBe(MARKDOWN_VALIDATION_DATA.zero);
    });
  }, MARKDOWN_HARNESS_TIMEOUT);

  it("reports the same broken markdown file once it sits inside a default directory", async () => {
    await withMarkdownTempProject(async ({ docsDir, productDir, spxDir, writeValidMarkdownPair }) => {
      await writeValidMarkdownPair(spxDir);
      await writeMarkdownFile(
        join(docsDir, MARKDOWN_VALIDATION_DATA.outsideDefaultBrokenFile),
        MARKDOWN_VALIDATION_DATA.brokenMarkdownContent,
      );

      const result = await markdownCommand({ cwd: productDir });

      expect(result.output).toContain(MARKDOWN_VALIDATION_DATA.outsideDefaultBrokenFile);
      expect(result.exitCode).toBe(MARKDOWN_VALIDATION_DATA.one);
    });
  }, MARKDOWN_HARNESS_TIMEOUT);
});
