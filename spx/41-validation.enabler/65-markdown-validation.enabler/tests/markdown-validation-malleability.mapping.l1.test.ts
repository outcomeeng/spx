import { describe, expect, it } from "vitest";

import { SPEC_TREE_METHODOLOGY_LINE } from "@/lib/spec-tree/config";
import { validateMarkdown } from "@/validation/steps/markdown";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { markdownDirectoryTarget } from "@testing/generators/validation/markdown";
import {
  arbitraryMalleabilityScenario,
  canonicalNodeSpec,
  malleabilityRows,
} from "@testing/generators/validation/node-spec";
import { withMarkdownTempProject } from "@testing/harnesses/validation/markdown";
import { MARKDOWN_HARNESS_TIMEOUT } from "@testing/harnesses/with-markdown-env";

describe("Explicit malleability declarations", () => {
  it(
    "map an absent malleability and each supported value to no error and every other value to an error naming the file, the line, and the value",
    async () => {
      const { seed, id, unsupported } = sampleGeneratedValue(arbitraryMalleabilityScenario());
      for (const { declared, admitted } of malleabilityRows(unsupported)) {
        const spec = canonicalNodeSpec(seed, { id, malleability: declared });
        await withMarkdownTempProject(async ({ productDir, spxDir, write }) => {
          const specFile = await write(spec.path, spec.content);

          const result = await validateMarkdown({ targets: [markdownDirectoryTarget(spxDir)], productDir });

          expect(result.success).toBe(admitted);
          if (admitted) {
            expect(result.errors).toEqual([]);
          } else {
            expect(result.errors).toEqual([
              expect.objectContaining({
                file: specFile,
                line: spec.malleabilityLine,
                detail: expect.stringContaining(unsupported),
              }),
            ]);
          }
        }, SPEC_TREE_METHODOLOGY_LINE.FOUR_ZERO);
      }
    },
    MARKDOWN_HARNESS_TIMEOUT,
  );
});
