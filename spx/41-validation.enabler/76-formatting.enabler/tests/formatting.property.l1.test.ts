import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { formattingValidationLanguage } from "@/validation/languages/formatting";
import { composeValidationPipelineStages, validationRegistry } from "@/validation/registry";
import { buildDprintCheckArgs, DPRINT_CHECK_SUBCOMMAND, DPRINT_EXCLUDES_OPTION } from "@/validation/steps/formatting";
import { arbitraryDprintFileArguments } from "@testing/generators/validation/formatting";

describe("dprint check argument construction is deterministic and scope-preserving", () => {
  it("emits the check subcommand first and preserves every file argument in order", () => {
    fc.assert(
      fc.property(arbitraryDprintFileArguments(), (files) => {
        const first = buildDprintCheckArgs({ files });
        const second = buildDprintCheckArgs({ files });

        expect(first).toEqual(second);
        expect(first[0]).toBe(DPRINT_CHECK_SUBCOMMAND);
        expect(first.slice(1)).toEqual(files);
      }),
    );
  });

  it("emits only the check subcommand when no file scope is supplied", () => {
    expect(buildDprintCheckArgs({})).toEqual([DPRINT_CHECK_SUBCOMMAND]);
  });

  it("emits additive excludes before preserving every file argument in order", () => {
    fc.assert(
      fc.property(arbitraryDprintFileArguments(), arbitraryDprintFileArguments(), (excludes, files) => {
        const args = buildDprintCheckArgs({ excludes, files });
        const excludeArguments = excludes.length > 0 ? [DPRINT_EXCLUDES_OPTION, ...excludes] : [];

        expect(args).toEqual([DPRINT_CHECK_SUBCOMMAND, ...excludeArguments, ...files]);
      }),
    );
  });
});

describe("the formatting stage is additive to the validation pipeline", () => {
  it("appends its own stages without altering the existing language stages", () => {
    const languagesWithoutFormatting = validationRegistry.languages.filter(
      (language) => language !== formattingValidationLanguage,
    );
    const baseStages = composeValidationPipelineStages(languagesWithoutFormatting);
    const fullStages = composeValidationPipelineStages(validationRegistry.languages);

    expect(fullStages.length).toBe(baseStages.length + formattingValidationLanguage.stages.length);
    expect(fullStages).toEqual(expect.arrayContaining([...baseStages]));
    expect(fullStages).toEqual(expect.arrayContaining([...formattingValidationLanguage.stages]));
  });
});
