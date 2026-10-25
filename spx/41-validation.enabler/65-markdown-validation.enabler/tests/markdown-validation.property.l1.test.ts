import { describe, expect, it } from "vitest";

import { SPEC_TREE_METHODOLOGY_LINE } from "@/lib/spec-tree/config";
import { validateMarkdown } from "@/validation/steps/markdown";
import { markdownDirectoryTarget } from "@testing/generators/validation/markdown";
import { arbitraryIdCandidateScenario } from "@testing/generators/validation/node-spec";
import {
  assertProperty,
  PROPERTY_CLASSIFICATION,
  propertyTestEnvelopeTimeoutMs,
} from "@testing/harnesses/property/property";
import { withMarkdownTempProject } from "@testing/harnesses/validation/markdown";

describe("Node spec id admission", () => {
  it(
    "admits the id exactly when the UUID is version 7 in the RFC 9562 variant and written in lowercase hyphenated form",
    async () => {
      await assertProperty(
        arbitraryIdCandidateScenario(),
        async ({ spec, candidate }) => {
          await withMarkdownTempProject(async ({ productDir, spxDir, write }) => {
            await write(spec.path, spec.content);

            const result = await validateMarkdown({ targets: [markdownDirectoryTarget(spxDir)], productDir });

            expect(result.success).toBe(candidate.admitted);
          }, SPEC_TREE_METHODOLOGY_LINE.FOUR_ZERO);
        },
        PROPERTY_CLASSIFICATION.SMALL_L1,
      );
    },
    propertyTestEnvelopeTimeoutMs(PROPERTY_CLASSIFICATION.SMALL_L1),
  );
});
