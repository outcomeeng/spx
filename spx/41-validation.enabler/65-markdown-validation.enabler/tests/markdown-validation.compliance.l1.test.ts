import { relative } from "node:path";
import { describe, expect, it } from "vitest";

import { allCommand } from "@/commands/validation/all";
import { markdownCommand } from "@/commands/validation/markdown";
import { getDefaultDirectories, validateMarkdown } from "@/validation/steps/markdown";
import { sampleGeneratedValue } from "@testing/generators/sample";
import {
  arbitrarySpecTreeLinkScenario,
  MARKDOWN_VALIDATION_DATA,
  markdownBrokenRelativeLink,
  markdownDirectoryTarget,
  specTreeDecisionPathAdmittedCases,
  specTreeDecisionPathTextCases,
  specTreeExistingTargetLinks,
  specTreeMissingTargetLinks,
  specTreeRejectedShapeLinks,
  specTreeTreeAbsoluteLink,
} from "@testing/generators/validation/markdown";
import { withMarkdownTempProject } from "@testing/harnesses/validation/markdown";
import { MARKDOWN_HARNESS_TIMEOUT } from "@testing/harnesses/with-markdown-env";

describe("ALWAYS: broken links fail spx validation all", () => {
  it("fails the full pipeline when a spec-tree markdown file carries a broken link", async () => {
    await withMarkdownTempProject(async ({ productDir, spxDir, write, writeValidMarkdownPair }) => {
      await writeValidMarkdownPair(spxDir);
      const { citingFile, content } = markdownBrokenRelativeLink(
        sampleGeneratedValue(arbitrarySpecTreeLinkScenario()),
        relative(productDir, spxDir),
      );
      await write(citingFile, content);

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
    await withMarkdownTempProject(async ({ docsDir, productDir, spxDir, write, writeValidMarkdownPair }) => {
      await writeValidMarkdownPair(spxDir);
      await writeValidMarkdownPair(docsDir);
      const scenario = sampleGeneratedValue(arbitrarySpecTreeLinkScenario());
      const { citingFile, content } = markdownBrokenRelativeLink(scenario, scenario.outsideDirectory);
      await write(citingFile, content);

      const result = await markdownCommand({ cwd: productDir });

      expect(getDefaultDirectories(productDir)).toEqual([spxDir, docsDir]);
      expect(result.output).not.toContain(citingFile);
      expect(result.exitCode).toBe(MARKDOWN_VALIDATION_DATA.zero);
    });
  }, MARKDOWN_HARNESS_TIMEOUT);

  it("reports the same broken markdown file once it sits inside a default directory", async () => {
    await withMarkdownTempProject(async ({ docsDir, productDir, spxDir, write, writeValidMarkdownPair }) => {
      await writeValidMarkdownPair(spxDir);
      const { citingFile, content } = markdownBrokenRelativeLink(
        sampleGeneratedValue(arbitrarySpecTreeLinkScenario()),
        relative(productDir, docsDir),
      );
      await write(citingFile, content);

      const result = await markdownCommand({ cwd: productDir });

      expect(result.output).toContain(citingFile);
      expect(result.exitCode).toBe(MARKDOWN_VALIDATION_DATA.one);
    });
  }, MARKDOWN_HARNESS_TIMEOUT);
});

describe("Inside spx/, a ../ climb, a leading-slash anchor, and a relative link into a descendant node each fail", () => {
  it.each(specTreeRejectedShapeLinks(sampleGeneratedValue(arbitrarySpecTreeLinkScenario())))(
    "reports $link.href naming the file, the line, and the link",
    async ({ link, supportingFiles }) => {
      await withMarkdownTempProject(async ({ productDir, spxDir, write }) => {
        for (const supportingFile of supportingFiles) await write(supportingFile.path, supportingFile.content);
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
      const { link, supportingFiles } = specTreeTreeAbsoluteLink(
        sampleGeneratedValue(arbitrarySpecTreeLinkScenario()),
      );
      for (const supportingFile of supportingFiles) await write(supportingFile.path, supportingFile.content);
      const citingFile = await write(link.citingFile, link.content);

      const result = await validateMarkdown({ targets: [markdownDirectoryTarget(spxDir)], productDir });

      expect(result.errors.filter((error) => error.file === citingFile)).toEqual([]);
    });
  }, MARKDOWN_HARNESS_TIMEOUT);
});

describe("Inside spx/, a link that resolves to no tracked file fails as a broken link", () => {
  it.each(specTreeMissingTargetLinks(sampleGeneratedValue(arbitrarySpecTreeLinkScenario())))(
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

  it.each(specTreeExistingTargetLinks(sampleGeneratedValue(arbitrarySpecTreeLinkScenario())))(
    "reports the broken link $link.href when its target exists but is not tracked",
    async ({ link, targetFile, targetContent }) => {
      await withMarkdownTempProject(async ({ productDir, spxDir, track, write }) => {
        await write(targetFile, targetContent);
        const citingFile = await write(link.citingFile, link.content);
        await track([link.citingFile]);

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

  it.each(specTreeExistingTargetLinks(sampleGeneratedValue(arbitrarySpecTreeLinkScenario())))(
    "admits the link $link.href once its target is tracked",
    async ({ link, targetFile, targetContent }) => {
      await withMarkdownTempProject(async ({ productDir, spxDir, track, write }) => {
        await write(targetFile, targetContent);
        const citingFile = await write(link.citingFile, link.content);
        await track([link.citingFile, targetFile]);

        const result = await validateMarkdown({ targets: [markdownDirectoryTarget(spxDir)], productDir });

        expect(result.errors.filter((error) => error.file === citingFile)).toEqual([]);
      });
    },
    MARKDOWN_HARNESS_TIMEOUT,
  );
});

describe("Inside spx/, a decision path written as text outside a link fails", () => {
  it.each(specTreeDecisionPathTextCases(sampleGeneratedValue(arbitrarySpecTreeLinkScenario())))(
    "reports the decision path on line $link.line naming the file, the line, and the path",
    async ({ link, supportingFiles }) => {
      await withMarkdownTempProject(async ({ productDir, spxDir, write }) => {
        for (const supportingFile of supportingFiles) await write(supportingFile.path, supportingFile.content);
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

  it.each(specTreeDecisionPathAdmittedCases(sampleGeneratedValue(arbitrarySpecTreeLinkScenario())))(
    "does not report the decision path inside a fenced code block or a link (line $link.line)",
    async ({ link, supportingFiles }) => {
      await withMarkdownTempProject(async ({ productDir, spxDir, write }) => {
        for (const supportingFile of supportingFiles) await write(supportingFile.path, supportingFile.content);
        const citingFile = await write(link.citingFile, link.content);

        const result = await validateMarkdown({ targets: [markdownDirectoryTarget(spxDir)], productDir });

        expect(result.errors.filter((error) => error.file === citingFile)).toEqual([]);
      });
    },
    MARKDOWN_HARNESS_TIMEOUT,
  );
});
