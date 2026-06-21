import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  FILE_INCLUSION_IGNORE_SOURCE_GENERATOR,
  sampleFileInclusionIgnoreSourceValue,
} from "@testing/generators/file-inclusion/ignore-source";
import {
  arbNodeSegment,
  excludeContents,
  integrationConfig,
  PROPERTY_NUM_RUNS,
  writeExclude,
} from "@testing/harnesses/file-inclusion/ignore-source";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

describe("ignore-source test harness — properties", () => {
  it("writeExclude writes the joined exclude lines through the env at the generator's exclude path", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(arbNodeSegment, { minLength: 1 }), async (lines) => {
        await withTestEnv(integrationConfig(), async (env) => {
          await writeExclude(env, lines);

          const excludeFilename = sampleFileInclusionIgnoreSourceValue(
            FILE_INCLUSION_IGNORE_SOURCE_GENERATOR.excludeFilename(),
          );

          expect(await env.readFile(excludeFilename)).toBe(excludeContents(lines));
        });
      }),
      { numRuns: PROPERTY_NUM_RUNS },
    );
  });
});
