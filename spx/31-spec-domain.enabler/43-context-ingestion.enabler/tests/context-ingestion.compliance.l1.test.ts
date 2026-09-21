import { mkdir, realpath, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { SPEC_CONTEXT_TEXT_LABEL } from "@/commands/spec/context";
import { DEFAULT_METHODOLOGY_SOURCE, METHODOLOGY_CONFIG_FIELDS, METHODOLOGY_SECTION } from "@/config/methodology";
import { LEGACY_METHODOLOGY_CONFIG_SECTION } from "@/config/methodology-placement";
import { SPEC_CONTEXT_TARGET_DIAGNOSTIC_PREFIX } from "@/interfaces/cli/spec-context-contract";
import { NODE_STATUS_FILENAME } from "@/lib/node-status";
import {
  KIND_REGISTRY,
  SPEC_CONTEXT_MANIFEST_SCHEMA_VERSION,
  SPEC_CONTEXT_TARGET_FAILURE_KIND,
  SPEC_TREE_CONFIG,
  specContextBootstrap,
} from "@/lib/spec-tree";
import {
  CONFIG_TEST_GENERATOR,
  generatedHarnessMethodologyConfig,
  generatedInvalidMethodologyConfigs,
  generatedLineFormMethodologySection,
  generatedMethodologySection,
  generatedMethodologySource,
  generatedMigratingMethodologySection,
  sampleConfigTestValue,
} from "@testing/generators/config/descriptors";
import { GIT_WORKTREE_TEST_GENERATOR, sampleGitWorktreeTestValue } from "@testing/generators/git-worktree/git-worktree";
import {
  specContextAmbiguousNestedDirectory,
  specContextExtendedRootDirectory,
  specContextLowerSiblingDirectoryName,
} from "@testing/generators/spec-tree/context-target";
import {
  sampleSpecTreeTestValue,
  SPEC_TREE_TEST_GENERATOR,
  specTreeFixtureNodeDirectoryName,
} from "@testing/generators/spec-tree/spec-tree";
import { GIT_TEST_CONFIG, GIT_TEST_FLAGS, GIT_TEST_SUBCOMMANDS, runGit } from "@testing/harnesses/git-test-constants";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import {
  allManifestPaths,
  contextListFailure,
  contextListJson,
  contextListManifest,
  contextListText,
  contextShowFailure,
  METHODOLOGY_FIXTURE_VERSION,
  parseContextManifest,
  rootedSpecPath,
  specTreeKindsConfig,
  trackedSpecContextGitDependencies,
} from "@testing/harnesses/spec/context";
import { createTempDir, removeTempDir } from "@testing/harnesses/with-temp-dir";

describe("spec context ingestion compliance", () => {
  it("never matches a longer path component as a suffix of a shorter operand", async () => {
    await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
      await env.materialize();
      const extended = specContextExtendedRootDirectory(env.fixture);
      await env.writeRaw(extended.extendedSpecPath, "# Extended sibling\n");
      const manifest = await contextListManifest({ targets: [extended.operand], cwd: env.productDir });
      expect(manifest.targets).toEqual([rootedSpecPath(extended.operand)]);
    });
  });

  it("rejects an operand two accepted targets share as a suffix, naming both, for list and for show", async () => {
    await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
      await env.materialize();
      const nested = specContextAmbiguousNestedDirectory(env.fixture);
      await env.writeRaw(nested.nestedSpecPath, "# Nested namesake\n");
      const rootTarget = rootedSpecPath(specTreeFixtureNodeDirectoryName(KIND_REGISTRY, env.fixture.root));
      for (
        const failure of [
          await contextListFailure({ targets: [nested.operand], cwd: env.productDir }),
          await contextShowFailure({ targets: [nested.operand], cwd: env.productDir }),
        ]
      ) {
        expect(failure).toContain(SPEC_CONTEXT_TARGET_DIAGNOSTIC_PREFIX[SPEC_CONTEXT_TARGET_FAILURE_KIND.AMBIGUOUS]);
        expect(failure).toContain(nested.operand);
        expect(failure).toContain(rootTarget);
        expect(failure).toContain(nested.nestedTargetPath);
      }
    });
  });

  it("never uses a resolvable descendant to disambiguate an ambiguous ancestor operand", async () => {
    await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
      await env.materialize();
      const nested = specContextAmbiguousNestedDirectory(env.fixture);
      await env.writeRaw(nested.nestedSpecPath, "# Nested namesake\n");
      // The child directory exists under the fixture root only, so a resolver
      // that let the descendant pick the ancestor would succeed here.
      const childDirectory = specTreeFixtureNodeDirectoryName(KIND_REGISTRY, env.fixture.child);
      const resolved = await contextListManifest({
        targets: [`${nested.operand}/${childDirectory}`],
        cwd: env.productDir,
      });
      expect(resolved.targets).toEqual([rootedSpecPath(`${nested.operand}/${childDirectory}`)]);
      const failure = await contextListFailure({ targets: [nested.operand], cwd: env.productDir });
      expect(failure).toContain(SPEC_CONTEXT_TARGET_DIAGNOSTIC_PREFIX[SPEC_CONTEXT_TARGET_FAILURE_KIND.AMBIGUOUS]);
    });
  });

  it("includes configured methodology identity, in either accepted version form, in the manifest", async () => {
    for (const methodology of [generatedMethodologySection(), generatedLineFormMethodologySection()]) {
      await withSpecTreeEnv({ ...specTreeKindsConfig(), [METHODOLOGY_SECTION]: methodology }, async (env) => {
        await env.materialize();
        const snapshot = await env.readFilesystemSnapshot();
        const target = snapshot.allNodes[0];
        const manifest = await contextListManifest({ targets: [target.id], cwd: env.productDir });
        expect(manifest.targets).toEqual([rootedSpecPath(target.id)]);
        expect(manifest.productDir).toBe(env.productDir);
        expect(manifest.methodology).toMatchObject({
          source: methodology[METHODOLOGY_CONFIG_FIELDS.SOURCE],
          version: methodology[METHODOLOGY_CONFIG_FIELDS.VERSION],
        });
      });
    }
  });

  it("carries the manifest schema version and the snapshot-derived bootstrap flag", async () => {
    await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
      await env.materialize();
      const snapshot = await env.readFilesystemSnapshot();
      const target = snapshot.allNodes[0];
      const manifest = await contextListManifest({ targets: [target.id], cwd: env.productDir });
      expect(manifest.schemaVersion).toBe(SPEC_CONTEXT_MANIFEST_SCHEMA_VERSION);
      expect(specContextBootstrap(0)).toBe(true);
      expect(specContextBootstrap(snapshot.allNodes.length)).toBe(false);
      // The materialized fixture holds nodes by construction, and a
      // resolvable target implies a non-empty tree, so the emitted flag is
      // false without re-running the production derivation.
      expect(manifest.bootstrap).toBe(false);
    });
  });

  it("excludes untracked node-shaped scratch paths from the manifest", async () => {
    await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
      await env.materialize();
      const trackedSnapshot = await env.readFilesystemSnapshot();
      const trackedPaths = trackedSnapshot.entries
        .map((entry) => entry.ref?.path)
        .filter((path): path is string => path !== undefined);
      const target = specTreeFixtureNodeDirectoryName(KIND_REGISTRY, env.fixture.peer);
      const scratch = specContextLowerSiblingDirectoryName(env.fixture);
      await env.writeRaw(rootedSpecPath(`${scratch}/${env.fixture.root.slug}.md`), "# Scratch\n");
      await env.writeRaw(rootedSpecPath(`${target}/PLAN.md`), "# Scratch plan\n");

      const manifest = await contextListManifest({
        targets: [target],
        cwd: env.productDir,
        gitDependencies: trackedSpecContextGitDependencies(env.productDir, trackedPaths),
      });

      expect(allManifestPaths(manifest)).not.toContain(rootedSpecPath(`${scratch}/${env.fixture.root.slug}.md`));
      expect(allManifestPaths(manifest)).not.toContain(rootedSpecPath(`${target}/PLAN.md`));
    });
  });

  it("reads tracked context from the linked worktree root", async () => {
    await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
      await env.materialize();
      await runGit(env.productDir, [GIT_TEST_SUBCOMMANDS.INIT]);
      await runGit(env.productDir, [GIT_TEST_SUBCOMMANDS.CONFIG, GIT_TEST_CONFIG.EMAIL_KEY, GIT_TEST_CONFIG.EMAIL]);
      await runGit(
        env.productDir,
        [GIT_TEST_SUBCOMMANDS.CONFIG, GIT_TEST_CONFIG.USER_NAME_KEY, GIT_TEST_CONFIG.USER_NAME],
      );
      await runGit(env.productDir, [GIT_TEST_SUBCOMMANDS.ADD, SPEC_TREE_CONFIG.ROOT_DIRECTORY]);
      await runGit(
        env.productDir,
        [GIT_TEST_SUBCOMMANDS.COMMIT, GIT_TEST_FLAGS.COMMIT_MESSAGE, env.fixture.product.title],
      );

      const linkedParent = await createTempDir("spx-context-linked-");
      try {
        const linkedProductDir = join(linkedParent, sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug()));
        await runGit(env.productDir, [
          GIT_TEST_SUBCOMMANDS.WORKTREE,
          GIT_TEST_SUBCOMMANDS.ADD,
          GIT_TEST_FLAGS.NEW_BRANCH,
          `${env.fixture.root.slug}-context`,
          linkedProductDir,
        ]);
        const nestedCwd = join(
          linkedProductDir,
          sampleGitWorktreeTestValue(GIT_WORKTREE_TEST_GENERATOR.nestedDirectory()),
        );
        await mkdir(nestedCwd, { recursive: true });
        const scratch = specContextLowerSiblingDirectoryName(env.fixture);
        const scratchPath = rootedSpecPath(`${scratch}/${env.fixture.root.slug}.md`);
        await mkdir(dirname(join(linkedProductDir, scratchPath)), { recursive: true });
        await writeFile(join(linkedProductDir, scratchPath), "# Untracked scratch\n");

        const target = specTreeFixtureNodeDirectoryName(KIND_REGISTRY, env.fixture.root);
        const manifest = await contextListManifest({ targets: [target], cwd: nestedCwd });

        expect(manifest.productDir).toBe(await realpath(linkedProductDir));
        expect(manifest.targets).toEqual([rootedSpecPath(target)]);
        expect(allManifestPaths(manifest)).not.toContain(scratchPath);
      } finally {
        await removeTempDir(linkedParent);
      }
    });
  });

  it("omits missing node spec paths from the manifest", async () => {
    await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
      await env.materialize();
      const snapshot = await env.readFilesystemSnapshot();
      const target = snapshot.allNodes[0];
      const missingChildDirectory = specTreeFixtureNodeDirectoryName(KIND_REGISTRY, {
        ...env.fixture.child,
        slug: sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug()),
      });
      const missingChild = `${target.id}/${missingChildDirectory}`;
      await env.writeRaw(rootedSpecPath(`${missingChild}/${NODE_STATUS_FILENAME}`), "{}");

      const manifest = await contextListManifest({ targets: [missingChild], cwd: env.productDir });

      expect(manifest.targets).toEqual([rootedSpecPath(missingChild)]);
      expect(allManifestPaths(manifest).some((path) => path.startsWith(`${rootedSpecPath(missingChild)}/`))).toBe(
        false,
      );
    });
  });

  it("renders the manifest as labelled text beside its JSON representation", async () => {
    await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
      await env.materialize();
      const snapshot = await env.readFilesystemSnapshot();
      const target = snapshot.allNodes[0];
      const textOutput = await contextListText({ targets: [target.id], cwd: env.productDir });
      const jsonOutput = await contextListJson({ targets: [target.id], cwd: env.productDir });
      expect(textOutput).toContain(`${SPEC_CONTEXT_TEXT_LABEL.TARGETS}: ${rootedSpecPath(target.id)}`);
      expect(textOutput).toContain(`${SPEC_CONTEXT_TEXT_LABEL.PRODUCT_ROOT}: ${env.productDir}`);
      expect(textOutput).toContain(
        `${SPEC_CONTEXT_TEXT_LABEL.METHODOLOGY}: ${DEFAULT_METHODOLOGY_SOURCE}@${METHODOLOGY_FIXTURE_VERSION}\n`,
      );
      expect(textOutput).toContain(
        `${SPEC_CONTEXT_TEXT_LABEL.SCHEMA_VERSION}: ${SPEC_CONTEXT_MANIFEST_SCHEMA_VERSION}`,
      );
      expect(textOutput).toContain(`${SPEC_CONTEXT_TEXT_LABEL.BOOTSTRAP}: false`);
      expect(textOutput).toContain(`${SPEC_CONTEXT_TEXT_LABEL.READ}:`);
      expect(textOutput).toContain(`${SPEC_CONTEXT_TEXT_LABEL.LISTED}:`);
      expect(parseContextManifest(jsonOutput).targets).toEqual([rootedSpecPath(target.id)]);
    });
  });

  it("renders the methodology identity as the source alone while no version is declared and with the migration source while one is open", async () => {
    const undeclaredSource = generatedMethodologySource();
    await withSpecTreeEnv({
      ...specTreeKindsConfig(),
      [METHODOLOGY_SECTION]: { [METHODOLOGY_CONFIG_FIELDS.SOURCE]: undeclaredSource },
    }, async (env) => {
      await env.materialize();
      const snapshot = await env.readFilesystemSnapshot();
      const target = snapshot.allNodes[0];
      const textOutput = await contextListText({ targets: [target.id], cwd: env.productDir });
      // The identity line ends at the source: no version separator and no
      // placeholder stands in for the undeclared version.
      expect(textOutput).toContain(
        `${SPEC_CONTEXT_TEXT_LABEL.METHODOLOGY}: ${undeclaredSource}\n${SPEC_CONTEXT_TEXT_LABEL.SCHEMA_VERSION}:`,
      );
    });

    const migrating = generatedMigratingMethodologySection();
    await withSpecTreeEnv({ ...specTreeKindsConfig(), [METHODOLOGY_SECTION]: migrating }, async (env) => {
      await env.materialize();
      const snapshot = await env.readFilesystemSnapshot();
      const target = snapshot.allNodes[0];
      const textOutput = await contextListText({ targets: [target.id], cwd: env.productDir });
      expect(textOutput).toContain(
        `${SPEC_CONTEXT_TEXT_LABEL.METHODOLOGY}: ${migrating[METHODOLOGY_CONFIG_FIELDS.SOURCE]}@${
          migrating[METHODOLOGY_CONFIG_FIELDS.VERSION]
        } (${SPEC_CONTEXT_TEXT_LABEL.MIGRATING_FROM} ${migrating[METHODOLOGY_CONFIG_FIELDS.MIGRATING_FROM]})\n`,
      );
    });
  });

  it("rejects every malformed methodology declaration before any output, naming the field", async () => {
    for (const invalid of generatedInvalidMethodologyConfigs()) {
      await withSpecTreeEnv({ ...specTreeKindsConfig(), ...invalid.config }, async (env) => {
        await env.materialize();
        const snapshot = await env.readFilesystemSnapshot();
        const target = snapshot.allNodes[0];
        expect(await contextListFailure({ targets: [target.id], cwd: env.productDir }), invalid.field).toContain(
          invalid.field,
        );
        expect(await contextShowFailure({ targets: [target.id], cwd: env.productDir }), invalid.field).toContain(
          invalid.field,
        );
      });
    }
  });

  // The two cases below witness the context commands' wiring to the shared
  // methodology resolver. The resolver's own behavior is owned and deeply
  // tested by the methodology-config node; these exist so a refactor of this
  // command's config path cannot silently drop the legacy-placement rejection
  // or start failing on unrelated config content.
  it("rejects stale harness methodology config before any output", async () => {
    await withSpecTreeEnv({ ...specTreeKindsConfig(), ...generatedHarnessMethodologyConfig() }, async (env) => {
      await env.materialize();
      const snapshot = await env.readFilesystemSnapshot();
      const target = snapshot.allNodes[0];
      expect(await contextListFailure({ targets: [target.id], cwd: env.productDir })).toContain(
        `${LEGACY_METHODOLOGY_CONFIG_SECTION}.${METHODOLOGY_SECTION}`,
      );
    });
  });

  it("ignores unrelated harness config defects when resolving methodology context", async () => {
    const methodology = generatedMethodologySection();
    await withSpecTreeEnv({
      ...specTreeKindsConfig(),
      [METHODOLOGY_SECTION]: methodology,
      [LEGACY_METHODOLOGY_CONFIG_SECTION]: {
        [sampleConfigTestValue(CONFIG_TEST_GENERATOR.key())]: generatedMethodologySection(),
      },
    }, async (env) => {
      await env.materialize();
      const snapshot = await env.readFilesystemSnapshot();
      const target = snapshot.allNodes[0];
      const manifest = await contextListManifest({ targets: [target.id], cwd: env.productDir });
      expect(manifest.methodology).toMatchObject({
        source: methodology[METHODOLOGY_CONFIG_FIELDS.SOURCE],
        version: methodology[METHODOLOGY_CONFIG_FIELDS.VERSION],
      });
    });
  });
});
