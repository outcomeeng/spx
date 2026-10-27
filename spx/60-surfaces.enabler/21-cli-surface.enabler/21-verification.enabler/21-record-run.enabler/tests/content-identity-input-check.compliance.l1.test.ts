import { describe, expect, it } from "vitest";

import { VERIFY_CLI_ERROR, VERIFY_CLI_EXIT_CODE, type VerifyInputCheckReport } from "@/commands/verify/cli";
import {
  VERIFY_INPUT_CHECK_FAILURE,
  VERIFY_INPUT_CHECK_RESULT,
  type VerifyInputCheckFailureReport,
} from "@/domains/verify/verify";
import { CONTENT_NORMALIZATION } from "@/lib/verification-input";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";
import {
  CHECK_FILE_RELATION,
  expectedEqualUnder,
  VERIFY_CONTENT_IDENTITY_TEST_GENERATOR,
} from "@testing/generators/verify/content-identity";
import { CLI_TIMEOUTS_MS } from "@testing/harnesses/constants";
import { observeBuiltInputCheck, observeBuiltInputCheckOfUnknownRun } from "@testing/harnesses/verify/built-cli";

describe("record-run input --check-file through the built executable", () => {
  it(
    "writes one JSON result to standard output and exits 0 for equal and 1 for different",
    async () => {
      for (const relation of Object.values(CHECK_FILE_RELATION)) {
        const scenario = sampleGeneratedValue(VERIFY_CONTENT_IDENTITY_TEST_GENERATOR.checkFileScenario(relation));

        for (const normalization of Object.values(CONTENT_NORMALIZATION)) {
          const observation = await observeBuiltInputCheck(
            scenario.recorded.bytes,
            { path: scenario.path, bytes: scenario.checked.bytes },
            normalization,
          );
          const equal = expectedEqualUnder(relation, normalization);

          expect(observation.check.exitCode, observation.check.stderr).toBe(
            equal ? VERIFY_CLI_EXIT_CODE.OK : VERIFY_CLI_EXIT_CODE.ERROR,
          );
          expect((JSON.parse(observation.check.stdout) as VerifyInputCheckReport).result).toBe(
            equal ? VERIFY_INPUT_CHECK_RESULT.EQUAL : VERIFY_INPUT_CHECK_RESULT.DIFFERENT,
          );
        }
      }
    },
    CLI_TIMEOUTS_MS.E2E_BATCH,
  );

  it(
    "writes one JSON result to standard output and exits 2 for a file it cannot read",
    async () => {
      const scenario = sampleGeneratedValue(
        VERIFY_CONTENT_IDENTITY_TEST_GENERATOR.checkFileScenario(CHECK_FILE_RELATION.IDENTICAL),
      );

      const observation = await observeBuiltInputCheck(scenario.recorded.bytes, {
        path: scenario.path,
        bytes: undefined,
      });

      expect(observation.check.exitCode).toBe(VERIFY_CLI_EXIT_CODE.CHECK_UNAVAILABLE);
      expect((JSON.parse(observation.check.stdout) as VerifyInputCheckFailureReport).result).toBe(
        VERIFY_INPUT_CHECK_FAILURE.CHECK_FILE_UNREADABLE,
      );
    },
    CLI_TIMEOUTS_MS.E2E_BATCH,
  );

  it(
    "writes one JSON result to standard output and exits 2 for a checked file that is not valid UTF-8 under universal-newline normalization",
    async () => {
      const scenario = sampleGeneratedValue(
        VERIFY_CONTENT_IDENTITY_TEST_GENERATOR.checkFileScenario(CHECK_FILE_RELATION.IDENTICAL),
      );
      const invalid = sampleGeneratedValue(VERIFY_CONTENT_IDENTITY_TEST_GENERATOR.invalidUtf8Input());

      const observation = await observeBuiltInputCheck(
        scenario.recorded.bytes,
        { path: scenario.path, bytes: invalid.bytes },
        CONTENT_NORMALIZATION.UTF8_UNIVERSAL_NEWLINES,
      );

      expect(observation.check.exitCode).toBe(VERIFY_CLI_EXIT_CODE.CHECK_UNAVAILABLE);
      expect((JSON.parse(observation.check.stdout) as VerifyInputCheckFailureReport).result).toBe(
        VERIFY_INPUT_CHECK_FAILURE.NORMALIZATION_FAILED,
      );
    },
    CLI_TIMEOUTS_MS.E2E_BATCH,
  );

  it(
    "writes one JSON result to standard output and exits 2 when the run recorded no digest of its input under the named normalization",
    async () => {
      const recorded = sampleGeneratedValue(VERIFY_CONTENT_IDENTITY_TEST_GENERATOR.invalidUtf8Input());
      const file = sampleGeneratedValue(
        VERIFY_CONTENT_IDENTITY_TEST_GENERATOR.checkFileScenario(CHECK_FILE_RELATION.IDENTICAL),
      );

      const observation = await observeBuiltInputCheck(
        recorded.bytes,
        { path: file.path, bytes: file.checked.bytes },
        CONTENT_NORMALIZATION.UTF8_UNIVERSAL_NEWLINES,
      );

      expect(observation.check.exitCode).toBe(VERIFY_CLI_EXIT_CODE.CHECK_UNAVAILABLE);
      expect((JSON.parse(observation.check.stdout) as VerifyInputCheckFailureReport).result).toBe(
        VERIFY_INPUT_CHECK_FAILURE.CONTENT_IDENTITY_UNAVAILABLE,
      );
    },
    CLI_TIMEOUTS_MS.E2E_BATCH,
  );

  it(
    "writes the run-lookup diagnostic to standard error, nothing to standard output, and exits 2 for a run it cannot locate",
    async () => {
      const runToken = sampleGeneratedValue(STATE_STORE_TEST_GENERATOR.runToken());
      const path = sampleGeneratedValue(VERIFY_CONTENT_IDENTITY_TEST_GENERATOR.productRelativePath());

      const run = await observeBuiltInputCheckOfUnknownRun(runToken, path);

      expect(run.exitCode).toBe(VERIFY_CLI_EXIT_CODE.CHECK_UNAVAILABLE);
      expect(run.stdout).toHaveLength(0);
      expect(run.stderr).toContain(VERIFY_CLI_ERROR.RUN_NOT_FOUND);
    },
    CLI_TIMEOUTS_MS.E2E_BATCH,
  );
});
