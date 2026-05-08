import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  arbitraryLiteralReuseFixtureInputs,
  LITERAL_TEST_GENERATOR_COUNTS,
  sampleLiteralEmptyConfig,
} from "@testing/generators/literal/literal";
import { withLiteralFixtureEnv } from "@testing/harnesses/literal/harness";

describe("withLiteralFixtureEnv properties", () => {
  it("writeReuseFixture is deterministic over LiteralReuseFixtureInputs", async () => {
    await fc.assert(
      fc.asyncProperty(arbitraryLiteralReuseFixtureInputs(), async (inputs) => {
        const captureFiles = async (): Promise<Record<string, string>> => {
          const captured: Record<string, string> = {};
          await withLiteralFixtureEnv(sampleLiteralEmptyConfig(), async (env) => {
            await env.writeReuseFixture(inputs);
            const paths = [
              inputs.reuseSourceFile,
              inputs.reuseTestFile,
              inputs.dupeFirstTestFile,
              inputs.dupeSecondTestFile,
            ];
            for (const path of paths) {
              captured[path] = await env.readFile(path);
            }
          });
          return captured;
        };
        const a = await captureFiles();
        const b = await captureFiles();
        expect(a).toEqual(b);
      }),
      { numRuns: LITERAL_TEST_GENERATOR_COUNTS.smallPropertyRuns },
    );
  });
});
