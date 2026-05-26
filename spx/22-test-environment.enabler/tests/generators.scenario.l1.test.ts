import { access } from "node:fs/promises";
import { join } from "node:path";

import * as fc from "fast-check";
import { describe, it } from "vitest";

import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

describe("env-scoped generators — produce fixtures materializable inside the callback", () => {
  it("every arbitraryNodePath sample can be written via writeNode and observed on disk", async () => {
    await withTestEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await fc.assert(
        fc.asyncProperty(env.arbitraryNodePath, async (path) => {
          const specRelative = `${path}/spec.md`;
          await env.writeNode(specRelative, `# ${path}\n`);
          await access(join(env.productDir, specRelative));
        }),
        { numRuns: 10 },
      );
    });
  });
});
