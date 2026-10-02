import { dirname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";

import { MARKDOWN_COMMAND_OUTPUT, markdownCommand } from "@/commands/validation/markdown";
import { VALIDATION_EXIT_CODES } from "@/commands/validation/messages";
import { createNodeStatusExcludeReader } from "@/lib/node-status/exclude";
import { compareAsciiStrings } from "@/lib/state-store";
import {
  MARKDOWN_CONFIG_CONTROL_KEYS,
  MARKDOWN_DEFAULT_DIRECTORY_NAMES,
  validateMarkdown,
} from "@/validation/steps/markdown";
import { sampleGeneratedValue } from "@testing/generators/sample";
import {
  arbitrarySpecTreeLinkScenario,
  markdownBrokenRelativeLink,
  markdownColonNamedBrokenLink,
  markdownDirectoryTarget,
  markdownDuplicateSiblingHeadings,
  markdownDuplicateSiblingHeadingsWithBrokenLink,
  markdownFileTarget,
  markdownMissingFragmentLink,
  markdownRepeatedHeadingUnderDistinctParents,
  markdownSecondaryExtensionBrokenLink,
  markdownValidFragmentLink,
  markdownValidRelativeLink,
  specTreeExcludedNodeCase,
  specTreeTreeAbsoluteLink,
} from "@testing/generators/validation/markdown";
import {
  listTreeEntries,
  repositoryMarkdownProject,
  withMarkdownTempProject,
} from "@testing/harnesses/validation/markdown";
import { MARKDOWN_FIXTURES, MARKDOWN_HARNESS_TIMEOUT, withMarkdownEnv } from "@testing/harnesses/with-markdown-env";

describe("Given a markdown file with a valid relative link to an existing file", () => {
  it("reports no error for that link", async () => {
    await withMarkdownTempProject(async ({ productDir, spxDir, writeLinkCase }) => {
      await writeLinkCase(
        markdownValidRelativeLink(sampleGeneratedValue(arbitrarySpecTreeLinkScenario()), relative(productDir, spxDir)),
      );

      const result = await validateMarkdown({ targets: [markdownDirectoryTarget(spxDir)], productDir });

      expect(result.errors).toEqual([]);
      expect(result.success).toBe(true);
    });
  }, MARKDOWN_HARNESS_TIMEOUT);
});

describe("Given a markdown file with a relative link to a non-existent file", () => {
  it("reports an error identifying the file, line number, and broken target", async () => {
    await withMarkdownTempProject(async ({ productDir, spxDir, write }) => {
      const link = markdownBrokenRelativeLink(
        sampleGeneratedValue(arbitrarySpecTreeLinkScenario()),
        relative(productDir, spxDir),
      );
      const brokenFile = await write(link.citingFile, link.content);

      const result = await validateMarkdown({ targets: [markdownDirectoryTarget(spxDir)], productDir });

      expect(result.success).toBe(false);
      expect(result.errors).toEqual([
        expect.objectContaining({
          file: brokenFile,
          line: link.line,
          detail: expect.stringContaining(link.href),
        }),
      ]);
    });
  }, MARKDOWN_HARNESS_TIMEOUT);
});

describe("Given a markdown file inside spx/ with a tree-absolute link", () => {
  it("resolves the link from the product root when spx validation markdown runs", async () => {
    await withMarkdownTempProject(async ({ productDir, writeLinkCase }) => {
      await writeLinkCase(specTreeTreeAbsoluteLink(sampleGeneratedValue(arbitrarySpecTreeLinkScenario())));

      const result = await markdownCommand({ cwd: productDir });

      expect(result.output).toContain(MARKDOWN_COMMAND_OUTPUT.NO_ISSUES);
      expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
    });
  }, MARKDOWN_HARNESS_TIMEOUT);
});

describe("Given a markdown file with a valid heading fragment reference", () => {
  it("reports no error", async () => {
    await withMarkdownTempProject(async ({ productDir, spxDir, writeLinkCase }) => {
      await writeLinkCase(
        markdownValidFragmentLink(sampleGeneratedValue(arbitrarySpecTreeLinkScenario()), relative(productDir, spxDir)),
      );

      const result = await validateMarkdown({ targets: [markdownDirectoryTarget(spxDir)], productDir });

      expect(result.errors).toEqual([]);
      expect(result.success).toBe(true);
    });
  }, MARKDOWN_HARNESS_TIMEOUT);
});

describe("Given a markdown file with a heading fragment referencing a non-existent heading", () => {
  it("reports an error", async () => {
    await withMarkdownTempProject(async ({ productDir, spxDir, writeLinkCase }) => {
      const linkCase = markdownMissingFragmentLink(
        sampleGeneratedValue(arbitrarySpecTreeLinkScenario()),
        relative(productDir, spxDir),
      );
      const sourceFile = await writeLinkCase(linkCase);

      const result = await validateMarkdown({ targets: [markdownDirectoryTarget(spxDir)], productDir });

      expect(result.success).toBe(false);
      expect(result.errors).toEqual([
        expect.objectContaining({
          file: sourceFile,
          line: linkCase.link.line,
          detail: expect.stringContaining(linkCase.link.href),
        }),
      ]);
    });
  }, MARKDOWN_HARNESS_TIMEOUT);
});

describe("Given spx/ contains duplicate sibling headings", () => {
  it("reports MD024 errors for the sibling duplicates", async () => {
    await withMarkdownTempProject(async ({ productDir, spxDir, write }) => {
      const duplicates = markdownDuplicateSiblingHeadings(
        sampleGeneratedValue(arbitrarySpecTreeLinkScenario()),
        relative(productDir, spxDir),
      );
      const duplicatesFile = await write(duplicates.path, duplicates.content);

      const result = await validateMarkdown({ targets: [markdownDirectoryTarget(spxDir)], productDir });

      expect(result.errors).toContainEqual(
        expect.objectContaining({
          file: duplicatesFile,
          detail: expect.stringContaining(MARKDOWN_CONFIG_CONTROL_KEYS.DUPLICATE_HEADINGS),
        }),
      );
    });
  }, MARKDOWN_HARNESS_TIMEOUT);
});

describe("Given spx/ contains the same heading under different parent sections", () => {
  it("reports no MD024 error", async () => {
    await withMarkdownTempProject(async ({ productDir, spxDir, write }) => {
      const repeated = markdownRepeatedHeadingUnderDistinctParents(
        sampleGeneratedValue(arbitrarySpecTreeLinkScenario()),
        relative(productDir, spxDir),
      );
      await write(repeated.path, repeated.content);

      const result = await validateMarkdown({ targets: [markdownDirectoryTarget(spxDir)], productDir });

      expect(result.errors).toEqual([]);
      expect(result.success).toBe(true);
    });
  }, MARKDOWN_HARNESS_TIMEOUT);
});

describe("Given docs/ contains duplicate sibling headings", () => {
  it("reports no MD024 errors for a docs directory target", async () => {
    await withMarkdownTempProject(async ({ docsDir, productDir, write }) => {
      const duplicates = markdownDuplicateSiblingHeadings(
        sampleGeneratedValue(arbitrarySpecTreeLinkScenario()),
        relative(productDir, docsDir),
      );
      await write(duplicates.path, duplicates.content);

      const result = await validateMarkdown({ targets: [markdownDirectoryTarget(docsDir)], productDir });

      expect(result.errors).toEqual([]);
      expect(result.success).toBe(true);
    });
  }, MARKDOWN_HARNESS_TIMEOUT);

  it("reports no MD024 errors for a direct docs file target", async () => {
    await withMarkdownTempProject(async ({ docsDir, productDir, write }) => {
      const scenario = sampleGeneratedValue(arbitrarySpecTreeLinkScenario());
      const duplicates = markdownDuplicateSiblingHeadings(
        scenario,
        join(relative(productDir, docsDir), scenario.docsSubdirectory),
      );
      const docsFile = await write(duplicates.path, duplicates.content);

      const result = await validateMarkdown({ targets: [markdownFileTarget(docsFile)], productDir });

      expect(result.errors).toEqual([]);
      expect(result.success).toBe(true);
    });
  }, MARKDOWN_HARNESS_TIMEOUT);
});

describe("Given docs/ contains other markdown errors", () => {
  it("still reports those non-MD024 errors", async () => {
    await withMarkdownTempProject(async ({ docsDir, productDir, write }) => {
      const link = markdownDuplicateSiblingHeadingsWithBrokenLink(
        sampleGeneratedValue(arbitrarySpecTreeLinkScenario()),
        relative(productDir, docsDir),
      );
      const docsFile = await write(link.citingFile, link.content);

      const result = await validateMarkdown({ targets: [markdownDirectoryTarget(docsDir)], productDir });

      expect(result.success).toBe(false);
      expect(result.errors).toEqual([
        expect.objectContaining({ file: docsFile, line: link.line, detail: expect.stringContaining(link.href) }),
      ]);
    });
  }, MARKDOWN_HARNESS_TIMEOUT);
});

describe("Given spx/EXCLUDE lists a node path", () => {
  it("skips direct markdown files in that node while child-node markdown files remain in scope", async () => {
    await withMarkdownTempProject(async ({ productDir, spxDir, write, writeNodeStatusExclude }) => {
      const excluded = specTreeExcludedNodeCase(sampleGeneratedValue(arbitrarySpecTreeLinkScenario()));
      await writeNodeStatusExclude([excluded.excludeEntry]);
      const directFiles = await Promise.all(excluded.directFiles.map((link) => write(link.citingFile, link.content)));
      const childFile = await write(excluded.childNodeFile.citingFile, excluded.childNodeFile.content);

      const result = await validateMarkdown({ targets: [markdownDirectoryTarget(spxDir)], productDir });
      const reportedFiles = result.errors.map((error) => error.file);

      for (const directFile of directFiles) expect(reportedFiles).not.toContain(directFile);
      expect(reportedFiles).toContain(childFile);
    });
  }, MARKDOWN_HARNESS_TIMEOUT);

  it("skips direct markdown files when the excluded node itself is the directory target", async () => {
    await withMarkdownTempProject(async ({ productDir, write, writeNodeStatusExclude }) => {
      const excluded = specTreeExcludedNodeCase(sampleGeneratedValue(arbitrarySpecTreeLinkScenario()));
      await writeNodeStatusExclude([excluded.excludeEntry]);
      const directFiles = await Promise.all(excluded.directFiles.map((link) => write(link.citingFile, link.content)));
      const childFile = await write(excluded.childNodeFile.citingFile, excluded.childNodeFile.content);

      const result = await validateMarkdown({
        targets: [markdownDirectoryTarget(join(productDir, excluded.nodeDirectory))],
        productDir,
      });
      const reportedFiles = result.errors.map((error) => error.file);

      for (const directFile of directFiles) expect(reportedFiles).not.toContain(directFile);
      expect(reportedFiles).toContain(childFile);
    });
  }, MARKDOWN_HARNESS_TIMEOUT);
});

describe("Given a declared-state node with [test] links to files that do not exist yet is listed in spx/EXCLUDE", () => {
  it("does not report those broken links in the node's direct markdown files", async () => {
    await withMarkdownEnv({ fixture: MARKDOWN_FIXTURES.WITH_EXCLUDE }, async ({ path, spxDir }) => {
      const result = await validateMarkdown({ targets: [markdownDirectoryTarget(spxDir)], productDir: path });

      expect(result.errors).toEqual([]);
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
      const link = markdownSecondaryExtensionBrokenLink(
        sampleGeneratedValue(arbitrarySpecTreeLinkScenario()),
        relative(productDir, spxDir),
      );
      const markdownExtensionFile = await write(link.citingFile, link.content);

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
          line: link.line,
          detail: expect.stringContaining(link.href),
        }),
      ]);
    });
  }, MARKDOWN_HARNESS_TIMEOUT);
});

describe("Given a markdown file path contains a colon", () => {
  it("reports the file, line number, and rule detail instead of dropping the error", async () => {
    await withMarkdownTempProject(async ({ productDir, spxDir, write }) => {
      const link = markdownColonNamedBrokenLink(
        sampleGeneratedValue(arbitrarySpecTreeLinkScenario()),
        relative(productDir, spxDir),
      );
      const colonFile = await write(link.citingFile, link.content);

      const result = await validateMarkdown({ targets: [markdownFileTarget(colonFile)], productDir });

      expect(result.success).toBe(false);
      expect(result.errors).toEqual([
        expect.objectContaining({
          file: colonFile,
          line: link.line,
          detail: expect.stringContaining(link.href),
        }),
      ]);
    });
  }, MARKDOWN_HARNESS_TIMEOUT);
});

describe("Given a validated markdown directory", () => {
  it("leaves its file set unchanged with no config files or generated artifacts added", async () => {
    await withMarkdownTempProject(async ({ productDir, writeLinkCase }) => {
      const scenario = sampleGeneratedValue(arbitrarySpecTreeLinkScenario());
      await writeLinkCase(specTreeTreeAbsoluteLink(scenario));
      await writeLinkCase(markdownValidRelativeLink(scenario, scenario.nodeDirectory));
      const [specTreeDirectory] = MARKDOWN_DEFAULT_DIRECTORY_NAMES;
      const validatedDirectory = join(productDir, specTreeDirectory);
      const entriesBefore = listTreeEntries(validatedDirectory);

      await validateMarkdown({ targets: [markdownDirectoryTarget(validatedDirectory)], productDir });

      expect(listTreeEntries(validatedDirectory)).toEqual(entriesBefore);
    });
  }, MARKDOWN_HARNESS_TIMEOUT);
});
