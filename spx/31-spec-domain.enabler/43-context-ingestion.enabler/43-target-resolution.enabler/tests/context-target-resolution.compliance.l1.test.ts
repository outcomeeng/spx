import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { SPEC_CONTEXT_TARGET_DIAGNOSTIC_PREFIX } from "@/interfaces/cli/spec-context-contract";
import { KIND_REGISTRY, SPEC_CONTEXT_TARGET_FAILURE_KIND } from "@/lib/spec-tree";
import { specContextAmbiguousNestedDirectory } from "@testing/generators/spec-tree/context-target";
import {
  sampleSpecTreeTestValue,
  SPEC_TREE_TEST_GENERATOR,
  specTreeFixtureNodeDirectoryName,
} from "@testing/generators/spec-tree/spec-tree";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import {
  contextListFailure,
  contextListManifest,
  contextShowFailure,
  rootedSpecPath,
  SPEC_CONTEXT_ESCAPE_TARGET_FILENAME,
  specTreeKindsConfig,
  trackSpecTreeInGit,
} from "@testing/harnesses/spec/context";
import { createTempDir, removeTempDir } from "@testing/harnesses/with-temp-dir";

describe("spec context target resolution compliance", () => {
  it("never lets an invocation-relative match take precedence over a suffix match of another identity", async () => {
    await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
      await env.materialize();
      const nested = specContextAmbiguousNestedDirectory(env.fixture);
      await env.writeRaw(nested.nestedSpecPath, "# Nested namesake\n");
      await trackSpecTreeInGit(env);
      // From the peer directory the operand names the nested namesake exactly,
      // while the same operand is a suffix of the top-level node's path.
      const peerDirectory = specTreeFixtureNodeDirectoryName(KIND_REGISTRY, env.fixture.peer);
      const failure = await contextListFailure({
        targets: [nested.operand],
        cwd: join(env.productDir, rootedSpecPath(peerDirectory)),
      });
      expect(failure).toContain(SPEC_CONTEXT_TARGET_DIAGNOSTIC_PREFIX[SPEC_CONTEXT_TARGET_FAILURE_KIND.AMBIGUOUS]);
      expect(failure).toContain(nested.nestedTargetPath);
      expect(failure).toContain(rootedSpecPath(specTreeFixtureNodeDirectoryName(KIND_REGISTRY, env.fixture.root)));
    });
  });

  it("resolves a symbolic link inside the product to the identity of its canonical target", async () => {
    await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
      await env.materialize();
      const rootDirectory = specTreeFixtureNodeDirectoryName(KIND_REGISTRY, env.fixture.root);
      const alias = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
      await symlink(join(env.productDir, rootedSpecPath(rootDirectory)), join(env.productDir, alias));
      const manifest = await contextListManifest({ targets: [alias], cwd: env.productDir });
      expect(manifest.targets).toEqual([rootedSpecPath(rootDirectory)]);
    });
  });

  it("rejects a symbolic link whose canonical target escapes the product as outside the product", async () => {
    const outsideParent = await createTempDir("spx-context-outside-");
    try {
      await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
        await env.materialize();
        const outsidePath = join(outsideParent, SPEC_CONTEXT_ESCAPE_TARGET_FILENAME);
        await writeFile(outsidePath, "# Outside\n");
        const alias = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
        await mkdir(join(env.productDir, rootedSpecPath("")), { recursive: true });
        await symlink(outsidePath, join(env.productDir, alias));
        for (
          const failure of [
            await contextListFailure({ targets: [alias], cwd: env.productDir }),
            await contextShowFailure({ targets: [alias], cwd: env.productDir }),
          ]
        ) {
          expect(failure).toContain(
            SPEC_CONTEXT_TARGET_DIAGNOSTIC_PREFIX[SPEC_CONTEXT_TARGET_FAILURE_KIND.OUTSIDE_PRODUCT],
          );
          expect(failure).toContain(alias);
        }
      });
    } finally {
      await removeTempDir(outsideParent);
    }
  });

  it("never selects the first of several identities and never uses a descendant to disambiguate an ancestor", async () => {
    await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
      await env.materialize();
      const nested = specContextAmbiguousNestedDirectory(env.fixture);
      await env.writeRaw(nested.nestedSpecPath, "# Nested namesake\n");
      const rootTarget = rootedSpecPath(specTreeFixtureNodeDirectoryName(KIND_REGISTRY, env.fixture.root));
      const childDirectory = specTreeFixtureNodeDirectoryName(KIND_REGISTRY, env.fixture.child);
      // The child exists under the fixture root only, so a resolver that let
      // the descendant pick the ancestor would resolve the bare operand.
      const resolved = await contextListManifest({
        targets: [`${nested.operand}/${childDirectory}`],
        cwd: env.productDir,
      });
      expect(resolved.targets).toEqual([`${rootTarget}/${childDirectory}`]);
      for (
        const failure of [
          await contextListFailure({ targets: [nested.operand], cwd: env.productDir }),
          await contextShowFailure({ targets: [nested.operand], cwd: env.productDir }),
        ]
      ) {
        expect(failure).toContain(SPEC_CONTEXT_TARGET_DIAGNOSTIC_PREFIX[SPEC_CONTEXT_TARGET_FAILURE_KIND.AMBIGUOUS]);
        expect(failure).toContain(rootTarget);
        expect(failure).toContain(nested.nestedTargetPath);
      }
    });
  });
});
