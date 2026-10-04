import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { SPEC_CONTEXT_TARGET_DIAGNOSTIC_PREFIX } from "@/interfaces/cli/spec-context-contract";
import { SPEC_CONTEXT_TARGET_FAILURE_KIND } from "@/lib/spec-tree";
import {
  arbitrarySpecContextInvalidUtf8Bytes,
  specContextUnknownTarget,
} from "@testing/generators/spec-tree/context-target";
import { sampleSpecTreeTestValue } from "@testing/generators/spec-tree/spec-tree";
import { contextShowFailure, withRichContextEnv } from "@testing/harnesses/spec/context";

describe("spec context multi-target abort", () => {
  it("aborts the whole projection before output on any requested target failure or any selected document failure", async () => {
    await withRichContextEnv(async (env, paths) => {
      const unknown = specContextUnknownTarget(env.fixture);
      const unresolvedPrefix = SPEC_CONTEXT_TARGET_DIAGNOSTIC_PREFIX[SPEC_CONTEXT_TARGET_FAILURE_KIND.UNRESOLVED];
      const requested = await contextShowFailure({ targets: [paths.targetId, unknown], cwd: env.productDir });
      expect(requested).toContain(unresolvedPrefix);
      expect(requested).toContain(unknown);
      expect(requested).not.toContain(paths.productPath);
      // A Digest sibling the targeted projection selects fails the run when
      // its source cannot be decoded, though every other entry resolves.
      await writeFile(
        join(env.productDir, paths.higherIndexSiblingSpecPath),
        Buffer.from(sampleSpecTreeTestValue(arbitrarySpecContextInvalidUtf8Bytes())),
      );
      const document = await contextShowFailure({ targets: [paths.targetId], cwd: env.productDir });
      expect(document).toContain(paths.higherIndexSiblingSpecPath);
    });
  });
});
