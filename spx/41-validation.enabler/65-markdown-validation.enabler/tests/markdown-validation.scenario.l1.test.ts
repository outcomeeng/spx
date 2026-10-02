import { dirname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";

import { MARKDOWN_COMMAND_OUTPUT, markdownCommand } from "@/commands/validation/markdown";
import { createNodeStatusExcludeReader } from "@/lib/node-status/exclude";
import { compareAsciiStrings } from "@/lib/state-store";
import { validateMarkdown } from "@/validation/steps/markdown";
import {
  MARKDOWN_LINK_SHAPE_DATA,
  MARKDOWN_VALIDATION_DATA,
  markdownDirectoryTarget,
  markdownFileTarget,
} from "@testing/generators/validation/markdown";
import {
  listDirectoryEntries,
  repositoryMarkdownProject,
  withMarkdownTempProject,
} from "@testing/harnesses/validation/markdown";
import { MARKDOWN_FIXTURES, MARKDOWN_HARNESS_TIMEOUT, withMarkdownEnv } from "@testing/harnesses/with-markdown-env";

describe("Given a markdown file with a valid relative link to an existing file", () => {
  it("reports no error for that link", async () => {
    await withMarkdownTempProject(async ({ productDir, spxDir, writeValidMarkdownPair }) => {
      await writeValidMarkdownPair(spxDir);

      const result = await validateMarkdown({ targets: [markdownDirectoryTarget(spxDir)], productDir });

      expect(result.errors).toEqual([]);
      expect(result.success).toBe(true);
    });
  }, MARKDOWN_HARNESS_TIMEOUT);
});

describe("Given a markdown file with a relative link to a non-existent file", () => {
  it("reports an error identifying the file, line number, and broken target", async () => {
    await withMarkdownTempProject(async ({ productDir, spxDir, write }) => {
      const brokenFile = await write(
        join(relative(productDir, spxDir), MARKDOWN_VALIDATION_DATA.brokenMarkdownFile),
        MARKDOWN_VALIDATION_DATA.brokenMarkdownContent,
      );

      const result = await validateMarkdown({ targets: [markdownDirectoryTarget(spxDir)], productDir });

      expect(result.success).toBe(false);
      expect(result.errors).toEqual([
        expect.objectContaining({
          file: brokenFile,
          line: MARKDOWN_VALIDATION_DATA.brokenMarkdownLinkLine,
          detail: expect.stringContaining(MARKDOWN_VALIDATION_DATA.missingFileMarker),
        }),
      ]);
    });
  }, MARKDOWN_HARNESS_TIMEOUT);
});

describe("Given a markdown file inside spx/ with a tree-absolute link", () => {
  it("resolves the link from the product root when spx validation markdown runs", async () => {
    await withMarkdownTempProject(async ({ productDir, write }) => {
      await write(MARKDOWN_LINK_SHAPE_DATA.linkedFile, MARKDOWN_LINK_SHAPE_DATA.linkedContent);
      await write(
        MARKDOWN_LINK_SHAPE_DATA.treeAbsoluteLink.citingFile,
        MARKDOWN_LINK_SHAPE_DATA.treeAbsoluteLink.content,
      );

      const result = await markdownCommand({ cwd: productDir });

      expect(result.output).toContain(MARKDOWN_COMMAND_OUTPUT.NO_ISSUES);
      expect(result.exitCode).toBe(MARKDOWN_VALIDATION_DATA.zero);
    });
  }, MARKDOWN_HARNESS_TIMEOUT);
});

describe("Given a markdown file with a valid heading fragment reference", () => {
  it("reports no error", async () => {
    await withMarkdownTempProject(async ({ productDir, spxDir, write, writeValidMarkdownPair }) => {
      await writeValidMarkdownPair(spxDir);
      await write(
        join(relative(productDir, spxDir), MARKDOWN_VALIDATION_DATA.sourceMarkdownFile),
        MARKDOWN_VALIDATION_DATA.validFragmentSourceContent,
      );

      const result = await validateMarkdown({ targets: [markdownDirectoryTarget(spxDir)], productDir });

      expect(result.errors).toEqual([]);
      expect(result.success).toBe(true);
    });
  }, MARKDOWN_HARNESS_TIMEOUT);
});

describe("Given a markdown file with a heading fragment referencing a non-existent heading", () => {
  it("reports an error", async () => {
    await withMarkdownTempProject(async ({ productDir, spxDir, write, writeValidMarkdownPair }) => {
      await writeValidMarkdownPair(spxDir);
      const sourceFile = await write(
        join(relative(productDir, spxDir), MARKDOWN_VALIDATION_DATA.sourceMarkdownFile),
        MARKDOWN_VALIDATION_DATA.brokenFragmentSourceContent,
      );

      const result = await validateMarkdown({ targets: [markdownDirectoryTarget(spxDir)], productDir });

      expect(result.success).toBe(false);
      expect(result.errors).toEqual([
        expect.objectContaining({
          file: sourceFile,
          detail: expect.stringContaining(MARKDOWN_VALIDATION_DATA.missingHeadingMarker),
        }),
      ]);
    });
  }, MARKDOWN_HARNESS_TIMEOUT);
});

describe("Given spx/ contains duplicate sibling headings", () => {
  it("reports MD024 errors for the sibling duplicates", async () => {
    await withMarkdownEnv({ fixture: MARKDOWN_FIXTURES.DUPLICATE_HEADINGS }, async ({ spxDir }) => {
      const result = await validateMarkdown({ targets: [markdownDirectoryTarget(spxDir)] });

      expect(
        result.errors.filter((error) =>
          error.file.endsWith(MARKDOWN_VALIDATION_DATA.childMarkdownFile)
          && error.detail.includes(MARKDOWN_VALIDATION_DATA.md024RuleMarker)
        ),
      ).not.toEqual([]);
    });
  }, MARKDOWN_HARNESS_TIMEOUT);
});

describe("Given spx/ contains the same heading under different parent sections", () => {
  it("reports no MD024 error", async () => {
    await withMarkdownEnv({ fixture: MARKDOWN_FIXTURES.DUPLICATE_HEADINGS }, async ({ spxDir }) => {
      const result = await validateMarkdown({ targets: [markdownDirectoryTarget(spxDir)] });

      expect(
        result.errors.filter((error) =>
          error.file.endsWith(MARKDOWN_VALIDATION_DATA.sampleMarkdownFile)
          && error.detail.includes(MARKDOWN_VALIDATION_DATA.md024RuleMarker)
        ),
      ).toEqual([]);
    });
  }, MARKDOWN_HARNESS_TIMEOUT);
});

describe("Given docs/ contains duplicate sibling headings", () => {
  it("reports no MD024 errors for a docs directory target", async () => {
    await withMarkdownEnv({ fixture: MARKDOWN_FIXTURES.DUPLICATE_HEADINGS }, async ({ docsDir }) => {
      const result = await validateMarkdown({ targets: [markdownDirectoryTarget(docsDir)] });

      expect(result.errors.filter((error) => error.detail.includes(MARKDOWN_VALIDATION_DATA.md024RuleMarker)))
        .toEqual([]);
    });
  }, MARKDOWN_HARNESS_TIMEOUT);

  it("reports no MD024 errors for a direct docs file target", async () => {
    await withMarkdownTempProject(async ({ docsDir, productDir, write }) => {
      const docsFile = await write(
        join(
          relative(productDir, docsDir),
          MARKDOWN_VALIDATION_DATA.guideDirectoryName,
          MARKDOWN_VALIDATION_DATA.sourceMarkdownFile,
        ),
        MARKDOWN_VALIDATION_DATA.docsDirectFileMd024Content,
      );

      const result = await validateMarkdown({ targets: [markdownFileTarget(docsFile)], productDir });

      expect(result.errors).toEqual([]);
      expect(result.success).toBe(true);
    });
  }, MARKDOWN_HARNESS_TIMEOUT);
});

describe("Given docs/ contains other markdown errors", () => {
  it("still reports those non-MD024 errors", async () => {
    await withMarkdownEnv({ fixture: MARKDOWN_FIXTURES.DUPLICATE_HEADINGS }, async ({ docsDir }) => {
      const result = await validateMarkdown({ targets: [markdownDirectoryTarget(docsDir)] });

      expect(result.success).toBe(false);
      expect(result.errors.some((error) => error.detail.includes(MARKDOWN_VALIDATION_DATA.missingFileMarker)))
        .toBe(true);
    });
  }, MARKDOWN_HARNESS_TIMEOUT);
});

describe("Given spx/EXCLUDE lists a node path", () => {
  it("skips direct markdown files in that node while child-node markdown files remain in scope", async () => {
    await withMarkdownTempProject(async ({ productDir, spxDir, write, writeNodeStatusExclude }) => {
      const specTreeDir = relative(productDir, spxDir);
      const declaredNodeDir = join(specTreeDir, MARKDOWN_VALIDATION_DATA.declaredNodeDirectory);
      await writeNodeStatusExclude([MARKDOWN_VALIDATION_DATA.declaredNodeDirectory]);
      const declaredFile = await write(
        join(declaredNodeDir, MARKDOWN_VALIDATION_DATA.declaredMarkdownFile),
        MARKDOWN_VALIDATION_DATA.brokenMarkdownContent,
      );
      const declaredMarkdownExtensionFile = await write(
        join(declaredNodeDir, MARKDOWN_VALIDATION_DATA.declaredMarkdownExtensionFile),
        MARKDOWN_VALIDATION_DATA.brokenMarkdownContent,
      );
      const childFile = await write(
        join(
          declaredNodeDir,
          MARKDOWN_VALIDATION_DATA.declaredChildDirectory,
          MARKDOWN_VALIDATION_DATA.childMarkdownFile,
        ),
        MARKDOWN_VALIDATION_DATA.brokenMarkdownContent,
      );

      const result = await validateMarkdown({ targets: [markdownDirectoryTarget(spxDir)], productDir });
      const reportedFiles = result.errors.map((error) => error.file);

      expect(reportedFiles).not.toContain(declaredFile);
      expect(reportedFiles).not.toContain(declaredMarkdownExtensionFile);
      expect(reportedFiles).toContain(childFile);
    });
  }, MARKDOWN_HARNESS_TIMEOUT);

  it("skips direct markdown files when the excluded node itself is the directory target", async () => {
    await withMarkdownTempProject(async ({ productDir, spxDir, write, writeNodeStatusExclude }) => {
      const specTreeDir = relative(productDir, spxDir);
      const declaredNodeDir = join(specTreeDir, MARKDOWN_VALIDATION_DATA.declaredNodeDirectory);
      await writeNodeStatusExclude([MARKDOWN_VALIDATION_DATA.declaredNodeDirectory]);
      const declaredFile = await write(
        join(declaredNodeDir, MARKDOWN_VALIDATION_DATA.declaredMarkdownFile),
        MARKDOWN_VALIDATION_DATA.brokenMarkdownContent,
      );
      const childFile = await write(
        join(
          declaredNodeDir,
          MARKDOWN_VALIDATION_DATA.declaredChildDirectory,
          MARKDOWN_VALIDATION_DATA.childMarkdownFile,
        ),
        MARKDOWN_VALIDATION_DATA.brokenMarkdownContent,
      );

      const result = await validateMarkdown({
        targets: [markdownDirectoryTarget(join(productDir, declaredNodeDir))],
        productDir,
      });
      const reportedFiles = result.errors.map((error) => error.file);

      expect(reportedFiles).not.toContain(declaredFile);
      expect(reportedFiles).toContain(childFile);
    });
  }, MARKDOWN_HARNESS_TIMEOUT);
});

describe("Given a declared-state node with [test] links to files that do not exist yet is listed in spx/EXCLUDE", () => {
  it("does not report those broken links in the node's direct markdown files", async () => {
    await withMarkdownEnv({ fixture: MARKDOWN_FIXTURES.WITH_EXCLUDE }, async ({ path, spxDir }) => {
      const result = await validateMarkdown({ targets: [markdownDirectoryTarget(spxDir)], productDir: path });

      expect(result.errors.filter((error) => error.file.includes(MARKDOWN_VALIDATION_DATA.declaredNodeFragment)))
        .toEqual([]);
      expect(result.success).toBe(true);
    });
  }, MARKDOWN_HARNESS_TIMEOUT);
});

describe("Given repository spx/EXCLUDE lists markdown-skipped nodes", () => {
  it("lists exactly the direct spec-node markdown failures exposed with node-status excludes disabled", async () => {
    const { productDir, spxDir: specTreeDir } = repositoryMarkdownProject();

    const result = await validateMarkdown({
      targets: [markdownDirectoryTarget(specTreeDir)],
      productDir,
      applyNodeStatusExcludes: false,
    });
    const failingNodeDirectories = new Set(
      result.errors.map((error) => relative(specTreeDir, dirname(error.file)).replaceAll("\\", "/")),
    );

    expect([...failingNodeDirectories].sort(compareAsciiStrings)).toEqual(
      [...createNodeStatusExcludeReader(productDir).entries()].sort(compareAsciiStrings),
    );
  }, MARKDOWN_HARNESS_TIMEOUT);
});

describe("Given a directory scope contains a broken .markdown file and no broken .md file", () => {
  it("reports no error for the directory and reports the broken link for the direct .markdown file", async () => {
    await withMarkdownTempProject(async ({ productDir, spxDir, write }) => {
      const markdownExtensionFile = await write(
        join(relative(productDir, spxDir), MARKDOWN_VALIDATION_DATA.brokenMarkdownExtensionFile),
        MARKDOWN_VALIDATION_DATA.brokenMarkdownContent,
      );

      const directoryResult = await validateMarkdown({ targets: [markdownDirectoryTarget(spxDir)], productDir });
      const directFileResult = await validateMarkdown({
        targets: [markdownFileTarget(markdownExtensionFile)],
        productDir,
      });

      expect(directoryResult.errors).toEqual([]);
      expect(directoryResult.success).toBe(true);
      expect(directFileResult.success).toBe(false);
      expect(directFileResult.errors).toEqual([
        expect.objectContaining({
          file: markdownExtensionFile,
          detail: expect.stringContaining(MARKDOWN_VALIDATION_DATA.missingFileMarker),
        }),
      ]);
    });
  }, MARKDOWN_HARNESS_TIMEOUT);
});

describe("Given a markdown file path contains a colon", () => {
  it("reports the file, line number, and rule detail instead of dropping the error", async () => {
    await withMarkdownTempProject(async ({ productDir, spxDir, write }) => {
      const colonFile = await write(
        join(relative(productDir, spxDir), MARKDOWN_VALIDATION_DATA.colonMarkdownFile),
        MARKDOWN_VALIDATION_DATA.brokenMarkdownContent,
      );

      const result = await validateMarkdown({ targets: [markdownFileTarget(colonFile)], productDir });

      expect(result.success).toBe(false);
      expect(result.errors).toEqual([
        expect.objectContaining({
          file: colonFile,
          line: MARKDOWN_VALIDATION_DATA.brokenMarkdownLinkLine,
          detail: expect.stringContaining(MARKDOWN_VALIDATION_DATA.missingFileMarker),
        }),
      ]);
    });
  }, MARKDOWN_HARNESS_TIMEOUT);
});

describe("Given a validated markdown directory", () => {
  it("leaves its file set unchanged with no config files or generated artifacts added", async () => {
    await withMarkdownEnv({ fixture: MARKDOWN_FIXTURES.CLEAN_TREE }, async ({ spxDir }) => {
      const sampleDir = join(spxDir, MARKDOWN_VALIDATION_DATA.sampleDirectoryName);
      const rootBefore = listDirectoryEntries(spxDir);
      const sampleBefore = listDirectoryEntries(sampleDir);

      await validateMarkdown({ targets: [markdownDirectoryTarget(spxDir)] });

      expect(listDirectoryEntries(spxDir)).toEqual(rootBefore);
      expect(listDirectoryEntries(sampleDir)).toEqual(sampleBefore);
    });
  }, MARKDOWN_HARNESS_TIMEOUT);
});
