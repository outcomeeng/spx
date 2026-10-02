import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { markdownCommand } from "@/commands/validation/markdown";
import { VALIDATION_EXIT_CODES } from "@/commands/validation/messages";
import { compareAsciiStrings } from "@/lib/state-store";
import { MARKDOWN_VALIDATION_STAGE_PARTICIPATION } from "@/validation/languages/markdown";
import { VALIDATION_STAGE_PARTICIPATION } from "@/validation/languages/types";
import {
  buildMarkdownlintConfig,
  MARKDOWN_CONFIG_CONTROL_KEYS,
  MARKDOWN_DEFAULT_DIRECTORY_NAMES,
  MARKDOWN_ENABLED_BUILTIN_RULES,
  validateMarkdown,
} from "@/validation/steps/markdown";
import { sampleGeneratedValue } from "@testing/generators/sample";
import {
  arbitrarySpecTreeLinkScenario,
  markdownCommandResolutionRows,
  markdownDirectoryTarget,
  markdownFileTarget,
  markdownRuleResolutionRows,
  markdownUncheckedLinks,
} from "@testing/generators/validation/markdown";
import { withMarkdownTempProject } from "@testing/harnesses/validation/markdown";
import { MARKDOWN_HARNESS_TIMEOUT } from "@testing/harnesses/with-markdown-env";

describe("Enabled built-in markdownlint rules", () => {
  it("map every default directory to the curated rule set with all other built-in rules disabled", () => {
    for (const directoryName of MARKDOWN_DEFAULT_DIRECTORY_NAMES) {
      const config = buildMarkdownlintConfig(directoryName);

      expect(config).toMatchObject({
        [MARKDOWN_CONFIG_CONTROL_KEYS.DEFAULT]: false,
        ...MARKDOWN_ENABLED_BUILTIN_RULES,
      });
      expect(Object.keys(config).sort(compareAsciiStrings)).toEqual(
        [...Object.keys(MARKDOWN_ENABLED_BUILTIN_RULES), ...Object.values(MARKDOWN_CONFIG_CONTROL_KEYS)].sort(
          compareAsciiStrings,
        ),
      );
    }
  });

  it("maps MD024 to siblings_only for spx/ and to disabled for docs/", () => {
    const [specTreeDirectory, docsDirectory] = MARKDOWN_DEFAULT_DIRECTORY_NAMES;

    expect(buildMarkdownlintConfig(specTreeDirectory)[MARKDOWN_CONFIG_CONTROL_KEYS.DUPLICATE_HEADINGS]).toEqual({
      siblings_only: true,
    });
    expect(buildMarkdownlintConfig(docsDirectory)[MARKDOWN_CONFIG_CONTROL_KEYS.DUPLICATE_HEADINGS]).toBe(false);
  });
});

describe("Markdown full-pipeline participation", () => {
  it("maps to run by default", () => {
    expect(Object.values(MARKDOWN_VALIDATION_STAGE_PARTICIPATION).map((policy) => policy.default)).toEqual([
      VALIDATION_STAGE_PARTICIPATION.RUN,
    ]);
  });
});

describe("Link type resolution for command behavior", () => {
  it.each(markdownCommandResolutionRows(sampleGeneratedValue(arbitrarySpecTreeLinkScenario())))(
    "resolves the $directory/ link $link.href from the product root",
    async (row) => {
      await withMarkdownTempProject(async ({ productDir, write }) => {
        await write(row.declaredResolution, row.targetContent);
        await write(row.link.citingFile, row.link.content);

        const result = await markdownCommand({ cwd: productDir, files: [join(productDir, row.directory)] });

        expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
      });
    },
    MARKDOWN_HARNESS_TIMEOUT,
  );

  it.each(markdownCommandResolutionRows(sampleGeneratedValue(arbitrarySpecTreeLinkScenario())))(
    "does not resolve the $directory/ link $link.href from the citing file's directory",
    async (row) => {
      await withMarkdownTempProject(async ({ productDir, write }) => {
        await write(row.otherResolution, row.targetContent);
        await write(row.link.citingFile, row.link.content);

        const result = await markdownCommand({ cwd: productDir, files: [join(productDir, row.directory)] });

        expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.FAILURE);
        expect(result.output).toContain(row.link.href);
      });
    },
    MARKDOWN_HARNESS_TIMEOUT,
  );
});

describe("Link type resolution for local rule behavior", () => {
  it.each(markdownRuleResolutionRows(sampleGeneratedValue(arbitrarySpecTreeLinkScenario())))(
    "resolves the $directory/ link $link.href from the citing file's directory",
    async (row) => {
      await withMarkdownTempProject(async ({ productDir, write }) => {
        await write(row.declaredResolution, row.targetContent);
        const citingFile = await write(row.link.citingFile, row.link.content);

        const result = await validateMarkdown({
          targets: [markdownDirectoryTarget(join(productDir, row.directory))],
          productDir,
        });

        expect(result.errors.filter((error) => error.file === citingFile)).toEqual([]);
      });
    },
    MARKDOWN_HARNESS_TIMEOUT,
  );

  it.each(markdownRuleResolutionRows(sampleGeneratedValue(arbitrarySpecTreeLinkScenario())))(
    "does not resolve the $directory/ link $link.href from the product root",
    async (row) => {
      await withMarkdownTempProject(async ({ productDir, write }) => {
        await write(row.otherResolution, row.targetContent);
        const citingFile = await write(row.link.citingFile, row.link.content);

        const result = await validateMarkdown({
          targets: [markdownDirectoryTarget(join(productDir, row.directory))],
          productDir,
        });

        expect(result.errors).toContainEqual(
          expect.objectContaining({
            file: citingFile,
            line: row.link.line,
            detail: expect.stringContaining(row.link.href),
          }),
        );
      });
    },
    MARKDOWN_HARNESS_TIMEOUT,
  );

  it.each(markdownUncheckedLinks(sampleGeneratedValue(arbitrarySpecTreeLinkScenario())))(
    "does not check $href in $citingFile",
    async (link) => {
      await withMarkdownTempProject(async ({ productDir, write }) => {
        const citingFile = await write(link.citingFile, link.content);

        const result = await validateMarkdown({ targets: [markdownFileTarget(citingFile)], productDir });

        expect(result.errors).toEqual([]);
        expect(result.success).toBe(true);
      });
    },
    MARKDOWN_HARNESS_TIMEOUT,
  );
});
