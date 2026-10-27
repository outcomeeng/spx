import { describe, expect, it } from "vitest";

import {
  CONTENT_NORMALIZATION,
  digestRawBytes,
  digestUniversalNewlineText,
  inspectVerificationInput,
} from "@/lib/verification-input";
import { referenceSha256, VERIFICATION_INPUT_TEST_GENERATOR } from "@testing/generators/verification-input";
import {
  assertProperty,
  PROPERTY_CLASSIFICATION,
  PROPERTY_LEVEL,
  propertyTestEnvelopeTimeoutMs,
} from "@testing/harnesses/property/property";
import { withVerificationInputEnv } from "@testing/harnesses/verification-input/harness";

describe("verification input digests", () => {
  it("digests raw bytes as their SHA-256 for every byte sequence", () => {
    assertProperty(
      VERIFICATION_INPUT_TEST_GENERATOR.byteSequence(),
      (bytes) => {
        expect(digestRawBytes(bytes)).toBe(referenceSha256(bytes));
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("gives texts differing only in CRLF, CR, and LF line endings one universal-newline digest of their UTF-8 encoding", () => {
    assertProperty(
      VERIFICATION_INPUT_TEST_GENERATOR.lineEndingVariants(),
      (variants) => {
        expect(digestUniversalNewlineText(variants.first)).toBe(digestUniversalNewlineText(variants.second));
        expect(digestUniversalNewlineText(variants.first)).toBe(referenceSha256(variants.canonical));
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it(
    "digests one content identically under any file name and location",
    async () => {
      await withVerificationInputEnv(async (env) => {
        await assertProperty(
          VERIFICATION_INPUT_TEST_GENERATOR.textFileScenario(),
          async (scenario) => {
            const atPath = await env.writeFile(scenario.path, scenario.variants.first);
            const atOtherPath = await env.writeFile(scenario.otherPath, scenario.variants.first);

            const first = await inspectVerificationInput({
              operand: atPath,
              invocationDir: env.root,
              worktreeRoot: env.root,
            });
            const second = await inspectVerificationInput({
              operand: atOtherPath,
              invocationDir: env.root,
              worktreeRoot: env.root,
            });

            expect(first.ok && second.ok).toBe(true);
            if (!first.ok || !second.ok) return;
            expect(first.value.contentDigests).toEqual(second.value.contentDigests);
            expect(first.value.contentDigests[CONTENT_NORMALIZATION.NONE].sha256).toBe(
              referenceSha256(scenario.variants.first),
            );
            expect(first.value.contentDigests[CONTENT_NORMALIZATION.UTF8_UNIVERSAL_NEWLINES].sha256).toBe(
              referenceSha256(scenario.variants.canonical),
            );
          },
          PROPERTY_CLASSIFICATION.SMALL_L1,
        );
      });
    },
    propertyTestEnvelopeTimeoutMs(PROPERTY_CLASSIFICATION.SMALL_L1),
  );
});
