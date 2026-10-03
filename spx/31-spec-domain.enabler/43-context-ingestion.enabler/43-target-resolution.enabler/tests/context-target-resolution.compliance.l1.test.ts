import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { SPEC_CONTEXT_TARGET_DIAGNOSTIC_PREFIX } from "@/interfaces/cli/spec-context-contract";
import { KIND_REGISTRY, SPEC_CONTEXT_TARGET_FAILURE_KIND } from "@/lib/spec-tree";
import {
  specContextAbbreviatedRootPrefix,
  specContextAmbiguousNestedDirectory,
  specContextLexicalDetourOperand,
  specContextOutsideDocument,
  specContextUnknownTarget,
} from "@testing/generators/spec-tree/context-target";
import {
  rootedArtifactPath,
  rootedSpecPath,
  SPEC_CONTEXT_ESCAPE_TARGET_FILENAME,
  specFilePath,
} from "@testing/generators/spec-tree/rich-context";
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

  it("never resolves an operand that uniquely abbreviates one accepted component and matches no complete one", async () => {
    await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
      await env.materialize();
      await trackSpecTreeInGit(env);
      // The operand prefixes the root node's directory name and no other
      // component, so a resolver admitting unique abbreviated prefixes would
      // resolve it to the root node instead of failing.
      const operand = specContextAbbreviatedRootPrefix(env.fixture);
      expect(specTreeFixtureNodeDirectoryName(KIND_REGISTRY, env.fixture.root).startsWith(operand)).toBe(true);
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

  it("resolves a symbolic link inside the product to the identity of its canonical target", async () => {
    await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
      await env.materialize();
      const rootDirectory = specTreeFixtureNodeDirectoryName(KIND_REGISTRY, env.fixture.root);
      const alias = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
      await symlink(join(env.productDir, rootedSpecPath(rootDirectory)), join(env.productDir, alias));
      const manifest = await contextListManifest({ targets: [alias], cwd: env.productDir });
      expect(new Set(manifest.entries.flatMap((entry) => entry.selections.map(({ target }) => target)))).toEqual(
        new Set([rootedSpecPath(rootDirectory)]),
      );
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
      expect(new Set(resolved.entries.flatMap((entry) => entry.selections.map(({ target }) => target)))).toEqual(
        new Set([`${rootTarget}/${childDirectory}`]),
      );
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
      expect(new Set(manifest.entries.flatMap((entry) => entry.selections.map(({ target }) => target)))).toEqual(
        new Set([rootedSpecPath(rootDirectory)]),
      );
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
      expect(new Set(manifest.entries.flatMap((entry) => entry.selections.map(({ target }) => target)))).toEqual(
        new Set([rootedSpecPath(rootDirectory)]),
      );
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

  it("confines a missing candidate by where it resolves, so an unknown operand from a symlinked invocation directory fails as unresolved", async () => {
    await withOutsideProductDir(async (outsideParent) => {
      await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
        await env.materialize();
        await trackSpecTreeInGit(env);
        // The invocation directory reaches the product only through a symbolic
        // link outside it, while git reports the product root canonically.
        const invocationAlias = join(outsideParent, sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug()));
        await symlink(env.productDir, invocationAlias);
        const operand = specContextUnknownTarget(env.fixture);
        for (
          const failure of [
            await contextListFailure({ targets: [operand], cwd: invocationAlias }),
            await contextShowFailure({ targets: [operand], cwd: invocationAlias }),
          ]
        ) {
          expect(failure).toContain(
            SPEC_CONTEXT_TARGET_DIAGNOSTIC_PREFIX[SPEC_CONTEXT_TARGET_FAILURE_KIND.UNRESOLVED],
          );
          expect(failure).toContain(operand);
        }
      });
    });
  });
});
