import "@testing/harnesses/validation/scope-resolution-compliance";

import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { VALIDATION_EXIT_CODES } from "@/commands/validation/messages";
import { TEMP_DIRECTORY_PATH } from "@/lib/temp-directory";
import { sampleGeneratedValue } from "@testing/generators/sample";
import {
  arbitraryForeignScratchNames,
  arbitraryLeftoverScratchNames,
} from "@testing/generators/temp-directory/temp-directory";
import { VALIDATION_SCRATCH_STAGE, withValidationScratchRun } from "@testing/harnesses/validation/scratch-directories";

describe.each(Object.values(VALIDATION_SCRATCH_STAGE))(
  "ALWAYS: the temporary tsconfig directory of %s validation is a product-local scratch directory of the temp-directory substrate",
  (stage) => {
    it.each([VALIDATION_EXIT_CODES.SUCCESS, VALIDATION_EXIT_CODES.FAILURE])(
      "creates it under the scratch parent with the scratch prefix and removes it when the tool exits with code %s",
      async (exitCode) => {
        await withValidationScratchRun(async (scratch) => {
          const observed = await scratch.runStage(stage, exitCode);

          expect(observed.entriesDuringStage).toHaveLength(1);
          const [entryName] = observed.entriesDuringStage;
          expect(entryName?.startsWith(TEMP_DIRECTORY_PATH.SCRATCH_PREFIX)).toBe(true);
          expect(observed.configDirectories).toEqual([join(scratch.scratchParent, entryName ?? "")]);
          expect(observed.entriesAfterStage).toEqual([]);
          expect(scratch.removed).toContain(join(scratch.scratchParent, entryName ?? ""));
        });
      },
    );

    it("removes every leftover scratch entry a killed run left at its first scratch request and keeps entries of other tools", async () => {
      await withValidationScratchRun(async (scratch) => {
        const leftoverNames = sampleGeneratedValue(arbitraryLeftoverScratchNames());
        const foreignNames = sampleGeneratedValue(arbitraryForeignScratchNames());
        for (const name of [...leftoverNames, ...foreignNames]) {
          scratch.seedEntry(name);
        }

        const observed = await scratch.runStage(stage, VALIDATION_EXIT_CODES.SUCCESS);

        for (const name of leftoverNames) {
          expect(observed.entriesDuringStage).not.toContain(name);
          expect(observed.entriesAfterStage).not.toContain(name);
        }
        expect(observed.entriesDuringStage).toEqual(expect.arrayContaining(foreignNames));
        expect(observed.entriesAfterStage).toHaveLength(foreignNames.length);
        expect(observed.entriesAfterStage).toEqual(expect.arrayContaining(foreignNames));
      });
    });
  },
);
