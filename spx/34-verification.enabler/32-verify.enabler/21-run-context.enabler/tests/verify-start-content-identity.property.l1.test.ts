import { describe, expect, it } from "vitest";

import { VERIFY_CLI_EXIT_CODE } from "@/commands/verify/cli";
import { CONTENT_NORMALIZATION, UNIVERSAL_NEWLINE_DIGEST_VERSION } from "@/lib/verification-input";
import { referenceSha256 } from "@testing/generators/verification-input";
import {
  decodesAsUtf8,
  START_INPUT_KIND,
  VERIFY_CONTENT_IDENTITY_TEST_GENERATOR,
} from "@testing/generators/verify/content-identity";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";
import { observeStartOverInputBytes } from "@testing/harnesses/verify/content-identity";

describe("verify start content identity", () => {
  it("records the digests of the bytes the input reader returns, wherever the report and the sidecar carry them", async () => {
    await assertProperty(
      VERIFY_CONTENT_IDENTITY_TEST_GENERATOR.startInput(),
      async (input) => {
        const observation = await observeStartOverInputBytes(input.bytes);

        expect(observation.command.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
        const reported = observation.report?.input.contentDigests;
        const recorded = observation.recordedInput?.contentDigests;
        expect(reported?.[CONTENT_NORMALIZATION.NONE]).toEqual({ sha256: referenceSha256(input.bytes) });
        expect(recorded).toEqual(reported);

        const valid = decodesAsUtf8(input.bytes);
        expect(CONTENT_NORMALIZATION.UTF8_UNIVERSAL_NEWLINES in (reported ?? {})).toBe(valid);
        if (input.kind === START_INPUT_KIND.TEXT) {
          expect(reported?.[CONTENT_NORMALIZATION.UTF8_UNIVERSAL_NEWLINES]).toEqual({
            version: UNIVERSAL_NEWLINE_DIGEST_VERSION,
            sha256: referenceSha256(input.canonicalText ?? ""),
          });
          expect(observation.recordedInput?.content).toBe(input.text);
        }
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("omits the universal-newline digest for bytes that are not valid UTF-8 while still opening the run", async () => {
    await assertProperty(
      VERIFY_CONTENT_IDENTITY_TEST_GENERATOR.invalidUtf8Input(),
      async (input) => {
        const observation = await observeStartOverInputBytes(input.bytes);

        expect(observation.command.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(observation.stateRootExists).toBe(true);
        expect(observation.report?.input.contentDigests).toEqual({
          [CONTENT_NORMALIZATION.NONE]: { sha256: referenceSha256(input.bytes) },
        });
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
