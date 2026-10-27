import { describe, expect, it } from "vitest";

import { VERIFY_CLI_EXIT_CODE } from "@/commands/verify/cli";
import { CONTENT_NORMALIZATION } from "@/lib/verification-input";
import {
  referenceSha256,
  sampleVerificationInputValue,
  VERIFICATION_INPUT_TEST_GENERATOR,
} from "@testing/generators/verification-input";
import { CLI_TIMEOUTS_MS } from "@testing/harnesses/constants";
import { runBuiltInputInspect } from "@testing/harnesses/verification-input/built-cli";
import { withVerificationInputEnv } from "@testing/harnesses/verification-input/harness";

describe("verification input inspect through the built executable", () => {
  it(
    "writes one JSON result with the canonical path and both content digests to standard output and exits 0",
    async () => {
      const scenario = sampleVerificationInputValue(VERIFICATION_INPUT_TEST_GENERATOR.textFileScenario());

      await withVerificationInputEnv(async (env) => {
        await env.writeFile(scenario.path, scenario.variants.first);

        const run = await runBuiltInputInspect(env.root, scenario.path);

        expect(run.exitCode, run.stderr).toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(JSON.parse(run.stdout)).toEqual({
          path: scenario.path,
          contentDigests: {
            [CONTENT_NORMALIZATION.NONE]: { sha256: referenceSha256(scenario.variants.first) },
            [CONTENT_NORMALIZATION.UTF8_UNIVERSAL_NEWLINES]: {
              version: 1,
              sha256: referenceSha256(scenario.variants.canonical),
            },
          },
        });
      });
    },
    CLI_TIMEOUTS_MS.E2E_BATCH,
  );
});
