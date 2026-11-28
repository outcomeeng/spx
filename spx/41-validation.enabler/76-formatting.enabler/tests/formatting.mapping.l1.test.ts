import { describe, expect, it } from "vitest";

import { FORMATTING_COMMAND_OUTPUT, formattingCommand } from "@/commands/validation/formatting";
import { formattingValidationLanguage } from "@/validation/languages/formatting";
import { markdownValidationLanguage } from "@/validation/languages/markdown";
import { typescriptValidationLanguage } from "@/validation/languages/typescript";
import { validationPipelineStages, validationRegistry } from "@/validation/registry";
import { FORMATTING_VALIDATION_DATA as DATA } from "@testing/generators/validation/formatting";
import {
  FORMATTING_HARNESS_TIMEOUT,
  withFormattingFixtureFiles,
  writeFixtureFile,
} from "@testing/harnesses/validation/formatting";

describe("formatted file extensions", () => {
  it.each(DATA.formattedFileExtensions)(
    "an unformatted .%s file participates in the verdict and is reported",
    async (extension) => {
      await withFormattingFixtureFiles(async (productDir) => {
        const fileName = `${DATA.typeScriptSourceFilename}.${extension}`;
        await writeFixtureFile(productDir, fileName, DATA.unformattedContentByExtension[extension]);

        const result = await formattingCommand({ cwd: productDir, files: [fileName] });

        expect(result.exitCode).toBe(DATA.failureExitCode);
        expect(result.output).toContain(fileName);
      });
    },
    FORMATTING_HARNESS_TIMEOUT,
  );
});

describe("never-formatted paths", () => {
  it.each(DATA.neverFormattedPaths)(
    "an unformatted file at %s stays out of the verdict",
    async (path) => {
      await withFormattingFixtureFiles(async (productDir) => {
        const filePath = path.replace(DATA.globWildcard, DATA.typeScriptSourceFilename);
        await writeFixtureFile(productDir, filePath, DATA.unformattedTypeScriptContent);

        const result = await formattingCommand({ cwd: productDir });

        expect(result.exitCode).toBe(DATA.passExitCode);
        expect(result.output).toBe(FORMATTING_COMMAND_OUTPUT.NO_ISSUES);
      });
    },
    FORMATTING_HARNESS_TIMEOUT,
  );
});

describe("registry order of the language descriptors", () => {
  it("maps TypeScript, Markdown, and formatting to contiguous pipeline stage segments in that order", () => {
    const stageNames = validationPipelineStages.map((stage) => stage.name);
    const segments = [typescriptValidationLanguage, markdownValidationLanguage, formattingValidationLanguage].map(
      (language) => language.stages.map((stage) => stage.name),
    );

    expect(validationRegistry.languages).toEqual([
      typescriptValidationLanguage,
      markdownValidationLanguage,
      formattingValidationLanguage,
    ]);
    expect(stageNames).toEqual(segments.flat());
  });
});
