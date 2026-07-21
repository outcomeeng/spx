import { describe, expect, it } from "vitest";

import { SPEC_CONTEXT_TARGET_DIAGNOSTIC_PREFIX } from "@/interfaces/cli/spec-context-contract";
import { compareSpecContextOrdinal, SPEC_CONTEXT_READ_ROLE, SPEC_CONTEXT_TARGET_FAILURE_KIND } from "@/lib/spec-tree";
import { specContextUnknownTarget } from "@testing/generators/spec-tree/context-target";
import {
  contextCommand,
  parseContextManifest,
  rootedSpecPath,
  withRichContextEnv,
} from "@testing/harnesses/spec/context";

describe("spec context multi-target composition", () => {
  it("emits each shared document exactly once carrying every role and requiring target", async () => {
    await withRichContextEnv(async (env, paths) => {
      // The root node and its nested child share the product spec, the root
      // spec (target for one, ancestor for the other), and the ancestor
      // decision.
      const manifest = parseContextManifest(
        await contextCommand({ targets: [paths.rootDirectory, paths.targetId], cwd: env.productDir }),
      );
      const rootTarget = rootedSpecPath(paths.rootDirectory);
      const childTarget = rootedSpecPath(paths.targetId);
      expect(manifest.targets).toEqual([rootTarget, childTarget].sort(compareSpecContextOrdinal));

      const sharedProductEntries = manifest.read.filter((document) => document.path === paths.productPath);
      expect(sharedProductEntries).toHaveLength(1);
      expect(sharedProductEntries[0].roles).toEqual(
        expect.arrayContaining([
          { target: rootTarget, role: SPEC_CONTEXT_READ_ROLE.PRODUCT },
          { target: childTarget, role: SPEC_CONTEXT_READ_ROLE.PRODUCT },
        ]),
      );

      const sharedRootSpecEntries = manifest.read.filter((document) => document.path === paths.rootSpecPath);
      expect(sharedRootSpecEntries).toHaveLength(1);
      expect(sharedRootSpecEntries[0].roles).toEqual(
        expect.arrayContaining([
          { target: rootTarget, role: SPEC_CONTEXT_READ_ROLE.TARGET },
          { target: childTarget, role: SPEC_CONTEXT_READ_ROLE.ANCESTOR },
        ]),
      );

      const readPathList = manifest.read.map((document) => document.path);
      expect(new Set(readPathList).size).toBe(readPathList.length);
    });
  });

  it("fails the whole command with no partial bundle when one target of the set does not resolve", async () => {
    await withRichContextEnv(async (env, paths) => {
      const unknownTarget = specContextUnknownTarget(env.fixture);
      try {
        await contextCommand({ targets: [paths.targetId, unknownTarget], cwd: env.productDir });
        throw new Error("Expected the multi-target invocation to be rejected");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        expect(message).toContain(
          SPEC_CONTEXT_TARGET_DIAGNOSTIC_PREFIX[SPEC_CONTEXT_TARGET_FAILURE_KIND.UNKNOWN_SEGMENT],
        );
        expect(message).toContain(unknownTarget);
        expect(message).not.toContain(paths.productPath);
      }
    });
  });
});
