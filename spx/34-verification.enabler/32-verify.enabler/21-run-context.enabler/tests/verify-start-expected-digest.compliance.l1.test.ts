import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { VERIFY_CLI_EXIT_CODE } from "@/commands/verify/cli";
import { VERIFY_CONTENT_OPTION } from "@/domains/verify/verify";
import { CONTENT_NORMALIZATION, UNIVERSAL_NEWLINE_DIGEST_VERSION } from "@/lib/verification-input";
import { referenceSha256 } from "@testing/generators/verification-input";
import {
  referenceDigestUnder,
  VERIFY_CONTENT_IDENTITY_TEST_GENERATOR,
} from "@testing/generators/verify/content-identity";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";
import { observeStartOverInputBytes } from "@testing/harnesses/verify/content-identity";

describe("verify start expected content digest compliance", () => {
  it("rejects an expected digest that is not 64 lowercase hexadecimal characters, naming the option, before any run state exists", async () => {
    await assertProperty(
      VERIFY_CONTENT_IDENTITY_TEST_GENERATOR.malformedExpectedDigest(),
      async (expectedContentSha256) => {
        const observation = await observeStartOverInputBytes(new Uint8Array(), { expectedContentSha256 });

        expect(observation.command.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(observation.command.output).toContain(VERIFY_CONTENT_OPTION.EXPECTED_SHA256);
        expect(observation.stateRootExists).toBe(false);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("rejects a content normalization named without an expected digest, naming both options, before any run state exists", async () => {
    await assertProperty(
      VERIFY_CONTENT_IDENTITY_TEST_GENERATOR.textInput(),
      async (input) => {
        for (const contentNormalization of Object.values(CONTENT_NORMALIZATION)) {
          const observation = await observeStartOverInputBytes(input.bytes, { contentNormalization });

          expect(observation.command.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
          expect(observation.command.output).toContain(VERIFY_CONTENT_OPTION.EXPECTED_SHA256);
          expect(observation.command.output).toContain(VERIFY_CONTENT_OPTION.CONTENT_NORMALIZATION);
          expect(observation.stateRootExists).toBe(false);
        }
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("rejects a difference under the named normalization, naming both digests, before any run state exists", async () => {
    await assertProperty(
      VERIFY_CONTENT_IDENTITY_TEST_GENERATOR.textInput().chain((input) =>
        fc.tuple(
          ...Object.values(CONTENT_NORMALIZATION).map((normalization) =>
            VERIFY_CONTENT_IDENTITY_TEST_GENERATOR.digestOtherThan(referenceDigestUnder(normalization, input)).map(
              (expected) => ({ normalization, expected }),
            )
          ),
        ).map((rows) => ({ input, rows }))
      ),
      async ({ input, rows }) => {
        for (const { normalization, expected } of rows) {
          const observation = await observeStartOverInputBytes(input.bytes, {
            expectedContentSha256: expected,
            contentNormalization: normalization,
          });

          expect(observation.command.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
          expect(observation.command.output).toContain(expected);
          expect(observation.command.output).toContain(referenceDigestUnder(normalization, input));
          expect(observation.stateRootExists).toBe(false);
        }
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("rejects bytes that are not valid UTF-8 under universal-newline normalization, naming the normalization and its version, before any run state exists", async () => {
    await assertProperty(
      VERIFY_CONTENT_IDENTITY_TEST_GENERATOR.invalidUtf8Input().chain((input) =>
        VERIFY_CONTENT_IDENTITY_TEST_GENERATOR.wellFormedDigest().map((expected) => ({ input, expected }))
      ),
      async ({ input, expected }) => {
        const observation = await observeStartOverInputBytes(input.bytes, {
          expectedContentSha256: expected,
          contentNormalization: CONTENT_NORMALIZATION.UTF8_UNIVERSAL_NEWLINES,
        });

        expect(observation.command.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(observation.command.output).toContain(CONTENT_NORMALIZATION.UTF8_UNIVERSAL_NEWLINES);
        expect(observation.command.output).toContain(String(UNIVERSAL_NEWLINE_DIGEST_VERSION));
        expect(observation.stateRootExists).toBe(false);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("compares the expected digest with the digest of the raw bytes when no normalization is named, opening the run for any bytes", async () => {
    await assertProperty(
      VERIFY_CONTENT_IDENTITY_TEST_GENERATOR.startInput(),
      async (input) => {
        const observation = await observeStartOverInputBytes(input.bytes, {
          expectedContentSha256: referenceSha256(input.bytes),
        });

        expect(observation.command.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(observation.stateRootExists).toBe(true);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("rejects, when no normalization is named, an expected digest that equals the digest under universal-newline normalization and differs from the raw bytes' digest, naming both digests, before any run state exists", async () => {
    await assertProperty(
      VERIFY_CONTENT_IDENTITY_TEST_GENERATOR.lineEndingChangedTextInput(),
      async (input) => {
        const normalizedDigest = referenceDigestUnder(CONTENT_NORMALIZATION.UTF8_UNIVERSAL_NEWLINES, input);
        const observation = await observeStartOverInputBytes(input.bytes, {
          expectedContentSha256: normalizedDigest,
        });

        expect(observation.command.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(observation.command.output).toContain(normalizedDigest);
        expect(observation.command.output).toContain(referenceDigestUnder(CONTENT_NORMALIZATION.NONE, input));
        expect(observation.stateRootExists).toBe(false);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("opens the run when the expected digest equals the captured bytes' digest under the named normalization", async () => {
    await assertProperty(
      VERIFY_CONTENT_IDENTITY_TEST_GENERATOR.textInput(),
      async (input) => {
        for (const normalization of Object.values(CONTENT_NORMALIZATION)) {
          const observation = await observeStartOverInputBytes(input.bytes, {
            expectedContentSha256: referenceDigestUnder(normalization, input),
            contentNormalization: normalization,
          });

          expect(observation.command.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
          expect(observation.stateRootExists).toBe(true);
        }
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
