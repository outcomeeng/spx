import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { formattingValidationLanguage } from "@/validation/languages/formatting";
import { validationPipelineStages, validationRegistry } from "@/validation/registry";
import { buildDprintCheckArgs } from "@/validation/steps/formatting";
import { arbitraryDprintFileArguments, FORMATTING_VALIDATION_DATA } from "@testing/generators/validation/formatting";

describe("dprint check argument construction is deterministic and scope-preserving", () => {
  it("emits the check subcommand and terminator before preserving every file argument in order", () => {
    fc.assert(
      fc.property(arbitraryDprintFileArguments(), (files) => {
        const args = buildDprintCheckArgs({ files });
        const expectedArgs = files.length > 0
          ? [
            FORMATTING_VALIDATION_DATA.expectedDprintCheckSubcommand,
            FORMATTING_VALIDATION_DATA.expectedDprintOptionsTerminator,
            ...files,
          ]
          : [FORMATTING_VALIDATION_DATA.expectedDprintCheckSubcommand];

        expect(args).toEqual(expectedArgs);
      }),
    );
  });

  it("emits only the check subcommand when no file scope is supplied", () => {
    expect(buildDprintCheckArgs({})).toEqual([FORMATTING_VALIDATION_DATA.expectedDprintCheckSubcommand]);
  });

  it("emits additive excludes before preserving every file argument in order", () => {
    fc.assert(
      fc.property(arbitraryDprintFileArguments(), arbitraryDprintFileArguments(), (excludes, files) => {
        const args = buildDprintCheckArgs({ excludes, files });
        const excludeArguments = excludes.length > 0
          ? [FORMATTING_VALIDATION_DATA.expectedDprintExcludesOption, ...excludes]
          : [];
        const filePrefix = files.length > 0 ? [FORMATTING_VALIDATION_DATA.expectedDprintOptionsTerminator] : [];

        expect(args).toEqual([
          FORMATTING_VALIDATION_DATA.expectedDprintCheckSubcommand,
          ...excludeArguments,
          ...filePrefix,
          ...files,
        ]);
      }),
    );
  });
});

describe("the formatting stage composes additively into the validation pipeline", () => {
  it("appends its own stages while preserving the existing stage descriptors", () => {
    const languagesWithoutFormatting = validationRegistry.languages.filter(
      (language) => language !== formattingValidationLanguage,
    );
    const baseStages = languagesWithoutFormatting.flatMap((language) => language.stages);

    expect(validationPipelineStages.length).toBe(baseStages.length + formattingValidationLanguage.stages.length);
    expect(validationPipelineStages).toEqual([...baseStages, ...formattingValidationLanguage.stages]);
  });
});
