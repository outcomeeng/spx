import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { SPEC_CONTEXT_TARGET_DIAGNOSTIC_PREFIX } from "@/interfaces/cli/spec-context-contract";
import { KIND_REGISTRY, SPEC_CONTEXT_TARGET_FAILURE_KIND } from "@/lib/spec-tree";
import {
  specContextAmbiguousNestedDirectory,
  specContextExtendedRootDirectory,
  specContextLexicalDetourOperand,
  specContextOutsideDocument,
  specContextUnknownTarget,
} from "@testing/generators/spec-tree/context-target";
import {
  sampleSpecTreeTestValue,
  SPEC_TREE_TEST_GENERATOR,
  specTreeFixtureNodeDirectoryName,
} from "@testing/generators/spec-tree/spec-tree";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import {
  rootedArtifactPath,
  rootedSpecPath,
  SPEC_CONTEXT_ESCAPE_TARGET_FILENAME,
  specFilePath,
} from "@testing/generators/spec-tree/rich-context";
import {
  contextListFailure,
  contextListManifest,
  contextShowFailure,
  specTreeKindsConfig,
  trackSpecTreeInGit,
  withOutsideProductDir,
} from "@testing/harnesses/spec/context";

describe("spec context target resolution compliance", () => {
  it("never lets an invocation-relative match take precedence over a suffix match of another identity", async () => {
    await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
      await env.materialize();
      const nested = specContextAmbiguousNestedDirectory(env.fixture);
      await env.writeRaw(nested.nestedSpecPath, nested.nestedSpecContent);
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

  it("never matches an operand as an abbreviated prefix of a longer path component", async () => {
    await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
      await env.materialize();
      // A top-level directory extends the root's name, so a prefix match would
      // make the root's own name ambiguous between the two.
      const extended = specContextExtendedRootDirectory(env.fixture);
      await env.writeRaw(extended.extendedSpecPath, extended.extendedSpecContent);
      const manifest = await contextListManifest({ targets: [extended.operand], cwd: env.productDir });
      expect(manifest.targets).toEqual([rootedSpecPath(extended.operand)]);
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
    await withOutsideProductDir(async (outsideParent) => {
      await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
        await env.materialize();
        const outsidePath = join(outsideParent, SPEC_CONTEXT_ESCAPE_TARGET_FILENAME);
        await writeFile(outsidePath, specContextOutsideDocument());
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
    });
  });

  it("never selects the first of several identities and never uses a descendant to disambiguate an ancestor", async () => {
    await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
      await env.materialize();
      const nested = specContextAmbiguousNestedDirectory(env.fixture);
      await env.writeRaw(nested.nestedSpecPath, nested.nestedSpecContent);
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

  it("collapses distinct canonical candidates that denote one node into that node's identity", async () => {
    await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
      await env.materialize();
      const rootDirectory = specTreeFixtureNodeDirectoryName(KIND_REGISTRY, env.fixture.root);
      // From the product root the operand names an alias of the node's spec,
      // while its suffix match names the node directory: two canonical
      // candidates, one identity.
      await symlink(
        join(env.productDir, specFilePath(rootDirectory, env.fixture.root.slug)),
        join(env.productDir, rootDirectory),
      );
      const manifest = await contextListManifest({ targets: [rootDirectory], cwd: env.productDir });
      expect(manifest.targets).toEqual([rootedSpecPath(rootDirectory)]);
    });
  });

  it("normalizes a candidate lexically before resolving symbolic links", async () => {
    await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
      await env.materialize();
      const rootDirectory = specTreeFixtureNodeDirectoryName(KIND_REGISTRY, env.fixture.root);
      const childDirectory = specTreeFixtureNodeDirectoryName(KIND_REGISTRY, env.fixture.child);
      const alias = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
      // The alias names the child directory, so a physical walk of the parent
      // segment lands in the root node rather than the product root.
      await symlink(
        join(env.productDir, rootedArtifactPath(rootDirectory, childDirectory)),
        join(env.productDir, alias),
      );
      const manifest = await contextListManifest({
        targets: [specContextLexicalDetourOperand(alias, rootedSpecPath(rootDirectory))],
        cwd: env.productDir,
      });
      expect(manifest.targets).toEqual([rootedSpecPath(rootDirectory)]);
    });
  });

  it("fails as unresolved when no candidate denotes an accepted identity", async () => {
    await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
      await env.materialize();
      const operand = specContextUnknownTarget(env.fixture);
      for (
        const failure of [
          await contextListFailure({ targets: [operand], cwd: env.productDir }),
          await contextShowFailure({ targets: [operand], cwd: env.productDir }),
        ]
      ) {
        expect(failure).toContain(SPEC_CONTEXT_TARGET_DIAGNOSTIC_PREFIX[SPEC_CONTEXT_TARGET_FAILURE_KIND.UNRESOLVED]);
        expect(failure).toContain(operand);
      }
    });
  });
});
