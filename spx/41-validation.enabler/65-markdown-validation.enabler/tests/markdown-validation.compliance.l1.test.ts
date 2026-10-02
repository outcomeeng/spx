import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { allCommand } from "@/commands/validation/all";
import { markdownCommand } from "@/commands/validation/markdown";
import { getDefaultDirectories, validateMarkdown } from "@/validation/steps/markdown";
import {
  MARKDOWN_LINK_SHAPE_DATA,
  MARKDOWN_VALIDATION_DATA,
  markdownDirectoryTarget,
} from "@testing/generators/validation/markdown";
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

describe("Inside spx/, a ../ climb, a leading-slash anchor, and a relative link into a descendant node each fail", () => {
  it.each(MARKDOWN_LINK_SHAPE_DATA.rejectedShapeLinks)(
    "reports $href naming the file, the line, and the link",
    async (link) => {
      await withMarkdownTempProject(async ({ productDir, spxDir, write }) => {
        await write(MARKDOWN_LINK_SHAPE_DATA.linkedFile, MARKDOWN_LINK_SHAPE_DATA.linkedContent);
        await write(MARKDOWN_LINK_SHAPE_DATA.descendantLinkedFile, MARKDOWN_LINK_SHAPE_DATA.linkedContent);
        const citingFile = await write(link.citingFile, link.content);

        const result = await validateMarkdown({ targets: [markdownDirectoryTarget(spxDir)], productDir });

        expect(result.success).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            file: citingFile,
            line: link.line,
            detail: expect.stringContaining(link.href),
          }),
        );
      });
    },
    MARKDOWN_HARNESS_TIMEOUT,
  );

  it("admits a tree-absolute link to the same file", async () => {
    await withMarkdownTempProject(async ({ productDir, spxDir, write }) => {
      await write(MARKDOWN_LINK_SHAPE_DATA.linkedFile, MARKDOWN_LINK_SHAPE_DATA.linkedContent);
      const citingFile = await write(
        MARKDOWN_LINK_SHAPE_DATA.treeAbsoluteLink.citingFile,
        MARKDOWN_LINK_SHAPE_DATA.treeAbsoluteLink.content,
      );

      const result = await validateMarkdown({ targets: [markdownDirectoryTarget(spxDir)], productDir });

      expect(result.errors.filter((error) => error.file === citingFile)).toEqual([]);
    });
  }, MARKDOWN_HARNESS_TIMEOUT);
});

describe("Inside spx/, a link that resolves to no file fails as a broken link", () => {
  it.each(MARKDOWN_LINK_SHAPE_DATA.missingTargetLinks)(
    "reports the broken link $href naming the file, the line, and the link",
    async (link) => {
      await withMarkdownTempProject(async ({ productDir, spxDir, write }) => {
        const citingFile = await write(link.citingFile, link.content);

        const result = await validateMarkdown({ targets: [markdownDirectoryTarget(spxDir)], productDir });

        expect(result.success).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            file: citingFile,
            line: link.line,
            detail: expect.stringContaining(link.href),
          }),
        );
      });
    },
    MARKDOWN_HARNESS_TIMEOUT,
  );
});

describe("Inside spx/, a decision path written as text outside a link fails", () => {
  it.each(MARKDOWN_LINK_SHAPE_DATA.decisionPathTextCases)(
    "reports the decision path on line $line naming the file, the line, and the path",
    async (textCase) => {
      await withMarkdownTempProject(async ({ productDir, spxDir, write }) => {
        await write(MARKDOWN_LINK_SHAPE_DATA.decisionFile, MARKDOWN_LINK_SHAPE_DATA.decisionContent);
        const citingFile = await write(textCase.citingFile, textCase.content);

        const result = await validateMarkdown({ targets: [markdownDirectoryTarget(spxDir)], productDir });

        expect(result.success).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            file: citingFile,
            line: textCase.line,
            detail: expect.stringContaining(textCase.href),
          }),
        );
      });
    },
    MARKDOWN_HARNESS_TIMEOUT,
  );

  it.each(MARKDOWN_LINK_SHAPE_DATA.decisionPathAdmittedCases)(
    "does not report the decision path inside a fenced code block or a link (line $line)",
    async (admittedCase) => {
      await withMarkdownTempProject(async ({ productDir, spxDir, write }) => {
        await write(MARKDOWN_LINK_SHAPE_DATA.decisionFile, MARKDOWN_LINK_SHAPE_DATA.decisionContent);
        const citingFile = await write(admittedCase.citingFile, admittedCase.content);

        const result = await validateMarkdown({ targets: [markdownDirectoryTarget(spxDir)], productDir });

        expect(result.errors.filter((error) => error.file === citingFile)).toEqual([]);
      });
    },
    MARKDOWN_HARNESS_TIMEOUT,
  );
});
