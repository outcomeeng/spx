import { describe, expect, it } from "vitest";

import { readSpecTree } from "@/lib/spec-tree";
import { orderedDirectoryName, supersededNodeSuffixCases } from "@testing/generators/spec-tree/spec-tree";
import { withSpecTreeEnv, writeOrderedDirectory } from "@testing/harnesses/spec-tree/spec-tree";

describe("residual retention", () => {
  it.each(supersededNodeSuffixCases())("$title", async (testCase) => {
    const supersededDirectory = orderedDirectoryName(testCase.suffix);
    await withSpecTreeEnv({}, async (env) => {
      await env.materialize();
      await writeOrderedDirectory(env, supersededDirectory);
      const snapshot = await readSpecTree({ source: env.filesystemSource() });
      const superseded = snapshot.superseded.find((entry) => entry.id === supersededDirectory);
      expect(superseded?.version).toBe(testCase.version);
      expect(snapshot.allNodes.map((node) => node.id)).not.toContain(supersededDirectory);
    });
  });
});
