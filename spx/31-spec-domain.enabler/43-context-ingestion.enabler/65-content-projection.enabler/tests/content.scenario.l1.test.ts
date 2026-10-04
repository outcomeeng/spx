import { describe, expect, it } from "vitest";

import { contextShowEntries, documentAt, withRichContextEnv } from "@testing/harnesses/spec/context";

describe("spec context document content", () => {
  it("projects a selected document in Full as its selected front matter followed by its complete body", async () => {
    await withRichContextEnv(async (env, paths) => {
      const targeted = await contextShowEntries({ targets: [paths.targetId], cwd: env.productDir });
      const full = documentAt(targeted, paths.targetSpecPath);
      expect(full?.metadata).toEqual(paths.targetSelectedMetadata);
      expect(full?.content).toBe(paths.bodyText[paths.targetSpecPath]);
    });
  });

  it("projects a selected output node and a selected decision in Digest as the same metadata followed by the opening or the decision statement", async () => {
    await withRichContextEnv(async (env, paths) => {
      const discovery = await contextShowEntries({ targets: [], cwd: env.productDir });
      const nodeDigest = documentAt(discovery, paths.targetSpecPath);
      expect(nodeDigest?.metadata).toEqual(paths.targetSelectedMetadata);
      expect(nodeDigest?.content).toBe(paths.openingText[paths.targetSpecPath]);
      // The ancestor decision carries a rationale after its statement, so its
      // Digest is the statement paragraph alone.
      const decisionDigest = documentAt(discovery, paths.ancestorDecisionPath);
      expect(decisionDigest?.metadata).toEqual({});
      expect(decisionDigest?.content).toBe(paths.openingText[paths.ancestorDecisionPath]);
      expect(decisionDigest?.content).not.toBe(paths.sourceText[paths.ancestorDecisionPath]);
    });
  });
});
