import { describe, expect, it } from "vitest";

import {
  contextCommand,
  parseContextManifest,
  rootedSpecPath,
  withRichContextEnv,
} from "@testing/harnesses/spec/context";

describe("spec context target operands", () => {
  it("accepts one or more node-path operands and preserves the single-target contract for one operand", async () => {
    await withRichContextEnv(async (env, paths) => {
      const single = parseContextManifest(
        await contextCommand({ targets: [paths.targetId], cwd: env.productDir }),
      );
      expect(single.targets).toEqual([rootedSpecPath(paths.targetId)]);
      expect(single.coverage).toHaveLength(1);
      // A single-target bundle degenerates to the single-target contract: the
      // deduplicated read list IS that target's ordered read sequence.
      expect(single.read.map((document) => document.path)).toEqual(single.coverage[0].read);
      expect(single.listed.map((entry) => entry.path)).toEqual(single.coverage[0].listed);
      for (const document of single.read) {
        expect(document.roles).toHaveLength(1);
        expect(document.roles[0].target).toBe(rootedSpecPath(paths.targetId));
      }

      const pair = parseContextManifest(
        await contextCommand({ targets: [paths.rootDirectory, paths.targetId], cwd: env.productDir }),
      );
      expect(pair.targets).toHaveLength(2);
      expect(pair.coverage).toHaveLength(2);
    });
  });
});
