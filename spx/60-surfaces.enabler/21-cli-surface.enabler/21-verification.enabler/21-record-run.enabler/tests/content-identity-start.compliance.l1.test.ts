import { describe, expect, it } from "vitest";

import { VERIFY_CLI_EXIT_CODE } from "@/commands/verify/cli";
import { VERIFY_CONTENT_ERROR, VERIFY_INPUT_CHECK_FAILURE } from "@/domains/verify/verify";
import { CONTENT_NORMALIZATION } from "@/lib/verification-input";
import { sampleGeneratedValue } from "@testing/generators/sample";
import {
  referenceDigestUnder,
  VERIFY_CONTENT_IDENTITY_TEST_GENERATOR,
} from "@testing/generators/verify/content-identity";
import { CLI_TIMEOUTS_MS } from "@testing/harnesses/constants";
import { observeBuiltStartContentExpectation } from "@testing/harnesses/verify/built-cli";

describe("record-run start content expectation through the built executable", () => {
  it(
    "exits 1 with both digests on standard error and empty standard output when the input's digest differs under the named normalization",
    async () => {
      const input = sampleGeneratedValue(VERIFY_CONTENT_IDENTITY_TEST_GENERATOR.textInput());

      for (const normalization of Object.values(CONTENT_NORMALIZATION)) {
        const observed = referenceDigestUnder(normalization, input);
        const expected = sampleGeneratedValue(VERIFY_CONTENT_IDENTITY_TEST_GENERATOR.digestOtherThan(observed));

        const run = await observeBuiltStartContentExpectation(input.bytes, { sha256: expected, normalization });

        expect(run.exitCode, run.stderr).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(run.stdout).toHaveLength(0);
        expect(run.stderr).toContain(expected);
        expect(run.stderr).toContain(observed);
      }
    },
    CLI_TIMEOUTS_MS.E2E_BATCH,
  );

  it(
    "accepts the expected digest and each named normalization when the input's digest equals it",
    async () => {
      const input = sampleGeneratedValue(VERIFY_CONTENT_IDENTITY_TEST_GENERATOR.textInput());

      for (const normalization of Object.values(CONTENT_NORMALIZATION)) {
        const run = await observeBuiltStartContentExpectation(input.bytes, {
          sha256: referenceDigestUnder(normalization, input),
          normalization,
        });

        expect(run.exitCode, run.stderr).toBe(VERIFY_CLI_EXIT_CODE.OK);
      }
    },
    CLI_TIMEOUTS_MS.E2E_BATCH,
  );

  it(
    "exits 1 naming the malformed digest rule and writes nothing to standard output when the expected digest is not 64 lowercase hexadecimal characters",
    async () => {
      const input = sampleGeneratedValue(VERIFY_CONTENT_IDENTITY_TEST_GENERATOR.textInput());
      const malformed = sampleGeneratedValue(VERIFY_CONTENT_IDENTITY_TEST_GENERATOR.malformedExpectedDigest());

      for (const normalization of Object.values(CONTENT_NORMALIZATION)) {
        const run = await observeBuiltStartContentExpectation(input.bytes, { sha256: malformed, normalization });

        expect(run.exitCode, run.stderr).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(run.stdout).toHaveLength(0);
        expect(run.stderr).toContain(VERIFY_CONTENT_ERROR.EXPECTED_DIGEST_MALFORMED);
      }
    },
    CLI_TIMEOUTS_MS.E2E_BATCH,
  );

  it(
    "exits 1 naming the failed normalization and writes nothing to standard output when the input is not valid UTF-8 under universal-newline normalization",
    async () => {
      const input = sampleGeneratedValue(VERIFY_CONTENT_IDENTITY_TEST_GENERATOR.invalidUtf8Input());
      const expected = sampleGeneratedValue(VERIFY_CONTENT_IDENTITY_TEST_GENERATOR.wellFormedDigest());

      const run = await observeBuiltStartContentExpectation(input.bytes, {
        sha256: expected,
        normalization: CONTENT_NORMALIZATION.UTF8_UNIVERSAL_NEWLINES,
      });

      expect(run.exitCode, run.stderr).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
      expect(run.stdout).toHaveLength(0);
      expect(run.stderr).toContain(VERIFY_INPUT_CHECK_FAILURE.NORMALIZATION_FAILED);
    },
    CLI_TIMEOUTS_MS.E2E_BATCH,
  );

  it(
    "exits 1 naming the missing digest and writes nothing to standard output when a normalization is given without an expected digest",
    async () => {
      const input = sampleGeneratedValue(VERIFY_CONTENT_IDENTITY_TEST_GENERATOR.textInput());

      for (const normalization of Object.values(CONTENT_NORMALIZATION)) {
        const run = await observeBuiltStartContentExpectation(input.bytes, { normalization });

        expect(run.exitCode, run.stderr).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(run.stdout).toHaveLength(0);
        expect(run.stderr).toContain(VERIFY_CONTENT_ERROR.NORMALIZATION_WITHOUT_DIGEST);
      }
    },
    CLI_TIMEOUTS_MS.E2E_BATCH,
  );
});
