import { describe, expect, it } from "vitest";

import { VERIFY_CLI_EXIT_CODE } from "@/commands/verify/cli";
import { VERIFY_CONTENT_OPTION, VERIFY_INPUT_CHECK_FAILURE, VERIFY_INPUT_CHECK_RESULT } from "@/domains/verify/verify";
import { CONTENT_NORMALIZATION, UNIVERSAL_NEWLINE_DIGEST_VERSION } from "@/lib/verification-input";
import {
  CHECK_FILE_RELATION,
  VERIFY_CONTENT_IDENTITY_TEST_GENERATOR,
} from "@testing/generators/verify/content-identity";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";
import { observeInputCheck } from "@testing/harnesses/verify/content-identity";
import { parseInputReport } from "@testing/harnesses/verify/harness";

describe("verify input check compliance", () => {
  it("reports content-identity-unavailable, never different, for a run whose start recorded no digest under the named normalization", async () => {
    await assertProperty(
      VERIFY_CONTENT_IDENTITY_TEST_GENERATOR.checkFileScenario(CHECK_FILE_RELATION.IDENTICAL),
      async (scenario) => {
        const absent = await observeInputCheck({
          recordedBytes: scenario.recorded.bytes,
          checkedFile: { path: scenario.path, bytes: scenario.checked.bytes },
          contentNormalization: CONTENT_NORMALIZATION.UTF8_UNIVERSAL_NEWLINES,
          omitRecordedContentDigests: true,
        });
        expect(absent.command.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(absent.command.output).toContain(VERIFY_INPUT_CHECK_FAILURE.CONTENT_IDENTITY_UNAVAILABLE);
        expect(absent.command.output).not.toContain(VERIFY_INPUT_CHECK_RESULT.DIFFERENT);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("reports content-identity-unavailable for universal-newline normalization when the recorded bytes were not valid UTF-8", async () => {
    await assertProperty(
      VERIFY_CONTENT_IDENTITY_TEST_GENERATOR.invalidUtf8Input().chain((recorded) =>
        VERIFY_CONTENT_IDENTITY_TEST_GENERATOR.checkFileScenario(CHECK_FILE_RELATION.IDENTICAL).map((file) => ({
          recorded,
          file,
        }))
      ),
      async ({ recorded, file }) => {
        const observation = await observeInputCheck({
          recordedBytes: recorded.bytes,
          checkedFile: { path: file.path, bytes: file.checked.bytes },
          contentNormalization: CONTENT_NORMALIZATION.UTF8_UNIVERSAL_NEWLINES,
        });

        expect(observation.command.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(observation.command.output).toContain(VERIFY_INPUT_CHECK_FAILURE.CONTENT_IDENTITY_UNAVAILABLE);
        expect(observation.command.output).not.toContain(VERIFY_INPUT_CHECK_RESULT.DIFFERENT);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("reports normalization-failed, naming the normalization and its version, for a checked file that is not valid UTF-8", async () => {
    await assertProperty(
      VERIFY_CONTENT_IDENTITY_TEST_GENERATOR.checkFileScenario(CHECK_FILE_RELATION.IDENTICAL).chain((file) =>
        VERIFY_CONTENT_IDENTITY_TEST_GENERATOR.invalidUtf8Input().map((invalid) => ({ file, invalid }))
      ),
      async ({ file, invalid }) => {
        const observation = await observeInputCheck({
          recordedBytes: file.recorded.bytes,
          checkedFile: { path: file.path, bytes: invalid.bytes },
          contentNormalization: CONTENT_NORMALIZATION.UTF8_UNIVERSAL_NEWLINES,
        });

        expect(observation.command.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(observation.command.output).toContain(VERIFY_INPUT_CHECK_FAILURE.NORMALIZATION_FAILED);
        expect(observation.command.output).toContain(CONTENT_NORMALIZATION.UTF8_UNIVERSAL_NEWLINES);
        expect(observation.command.output).toContain(String(UNIVERSAL_NEWLINE_DIGEST_VERSION));
        expect(observation.command.output).not.toContain(VERIFY_INPUT_CHECK_RESULT.DIFFERENT);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("reports check-file-unreadable, naming the path, for a file it cannot read", async () => {
    await assertProperty(
      VERIFY_CONTENT_IDENTITY_TEST_GENERATOR.checkFileScenario(CHECK_FILE_RELATION.IDENTICAL),
      async (file) => {
        for (const contentNormalization of [undefined, ...Object.values(CONTENT_NORMALIZATION)]) {
          const observation = await observeInputCheck({
            recordedBytes: file.recorded.bytes,
            checkedFile: { path: file.path, bytes: undefined },
            ...(contentNormalization === undefined ? {} : { contentNormalization }),
          });

          expect(observation.command.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
          expect(observation.command.output).toContain(VERIFY_INPUT_CHECK_FAILURE.CHECK_FILE_UNREADABLE);
          expect(observation.command.output).toContain(file.path);
          expect(observation.command.output).not.toContain(VERIFY_INPUT_CHECK_RESULT.DIFFERENT);
        }
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("rejects a content normalization named without a file to check, naming both options", async () => {
    await assertProperty(
      VERIFY_CONTENT_IDENTITY_TEST_GENERATOR.textInput(),
      async (recorded) => {
        for (const contentNormalization of Object.values(CONTENT_NORMALIZATION)) {
          const observation = await observeInputCheck({ recordedBytes: recorded.bytes, contentNormalization });

          expect(observation.command.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
          expect(observation.command.output).toContain(VERIFY_CONTENT_OPTION.CHECK_FILE);
          expect(observation.command.output).toContain(VERIFY_CONTENT_OPTION.CONTENT_NORMALIZATION);
        }
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("returns the recorded input unchanged when no file is checked", async () => {
    await assertProperty(
      VERIFY_CONTENT_IDENTITY_TEST_GENERATOR.textInput(),
      async (recorded) => {
        const observation = await observeInputCheck({ recordedBytes: recorded.bytes });

        expect(observation.command.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
        const report = parseInputReport(observation.command.output);
        expect(report.content).toBe(recorded.text);
        expect(report.digest).toBe(observation.startReport.input.digest);
        expect(report.source).toBe(observation.startReport.input.source);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
