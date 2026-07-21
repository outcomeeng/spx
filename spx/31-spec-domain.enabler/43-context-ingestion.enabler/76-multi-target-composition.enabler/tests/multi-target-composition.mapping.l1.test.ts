import { describe, expect, it } from "vitest";

import { contextCommand, parseContextManifest, withRichContextEnv } from "@testing/harnesses/spec/context";

describe("spec context per-target coverage", () => {
  it("maps each requested target to its complete single-target read set through coverage references", async () => {
    await withRichContextEnv(async (env, paths) => {
      const bundle = parseContextManifest(
        await contextCommand({ targets: [paths.rootDirectory, paths.targetId], cwd: env.productDir }),
      );
      const bundleReadPaths = new Set(bundle.read.map((document) => document.path));
      const bundleListedPaths = new Set(bundle.listed.map((entry) => entry.path));

      for (const requested of [paths.rootDirectory, paths.targetId]) {
        const single = parseContextManifest(
          await contextCommand({ targets: [requested], cwd: env.productDir }),
        );
        const coverage = bundle.coverage.find((entry) => entry.target === single.targets[0]);
        // Each target's ordered read sequence is reconstructible from the
        // bundle alone and equals the single-target contract's read order.
        expect(coverage?.read).toEqual(single.read.map((document) => document.path));
        expect(coverage?.listed).toEqual(single.listed.map((entry) => entry.path));
        for (const path of coverage?.read ?? []) {
          expect(bundleReadPaths.has(path)).toBe(true);
        }
        for (const path of coverage?.listed ?? []) {
          expect(bundleListedPaths.has(path)).toBe(true);
        }
      }
    });
  });
});
