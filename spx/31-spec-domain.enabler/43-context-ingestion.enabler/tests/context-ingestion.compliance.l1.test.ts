import { mkdir, realpath, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { SPEC_CONTEXT_TEXT_LABEL } from "@/commands/spec/context";
import { METHODOLOGY_CONFIG_FIELDS, METHODOLOGY_SECTION } from "@/config/methodology";
import { LEGACY_METHODOLOGY_CONFIG_SECTION } from "@/config/methodology-placement";
import {
  contextOutputForFormat,
  SPEC_CONTEXT_OUTPUT_FORMAT_MESSAGE,
  type SpecContextOutputFormat,
} from "@/interfaces/cli/spec";
import { SPEC_CONTEXT_TARGET_DIAGNOSTIC_PREFIX } from "@/interfaces/cli/spec-context-contract";
import { NODE_STATUS_FILENAME } from "@/lib/node-status";
import {
  KIND_REGISTRY,
  projectSpecContextManifest,
  SPEC_CONTEXT_MANIFEST_SCHEMA_VERSION,
  SPEC_CONTEXT_TARGET_FAILURE_KIND,
  SPEC_TREE_CONFIG,
} from "@/lib/spec-tree";
import { generatedMethodologySection } from "@testing/generators/config/descriptors";
import { GIT_WORKTREE_TEST_GENERATOR, sampleGitWorktreeTestValue } from "@testing/generators/git-worktree/git-worktree";
import {
  arbitraryInvalidSpecContextOutputFormat,
  specContextAmbiguousTargetFixture,
  specContextExactPrefixTargetFixture,
  specContextLowerSiblingDirectoryName,
  specContextNestedAmbiguousTarget,
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
  contextCommand,
  contextTextCommand,
  parseContextManifest,
  rejectedContextMessage,
  rootedSpecPath,
  specTreeKindsConfig,
  trackedSpecContextGitDependencies,
} from "@testing/harnesses/spec/context";
import { createTempDir, removeTempDir } from "@testing/harnesses/with-temp-dir";

describe("spec context ingestion compliance", () => {
  it("prefers an exact node segment over another sibling that begins with it", async () => {
    await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
      await env.materialize();
      const fixture = specContextExactPrefixTargetFixture(env.fixture);
      await env.writeRaw(fixture.candidateSpecPath, "# Exact-prefix sibling\n");
      const manifest = parseContextManifest(
        await contextCommand({ targets: [fixture.target], cwd: env.productDir }),
      );
      expect(manifest.targets).toEqual([rootedSpecPath(fixture.target)]);
    });
  });

  it("rejects ambiguous node-segment prefixes without selecting a candidate", async () => {
    await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
      await env.materialize();
      const ambiguity = specContextAmbiguousTargetFixture(env.fixture);
      await env.writeRaw(ambiguity.specPath, "# Ambiguous sibling\n");
      const message = await rejectedContextMessage(ambiguity.prefix, env.productDir);
      expect(message).toContain(ambiguity.prefix);
      expect(message).toContain(
        SPEC_CONTEXT_TARGET_DIAGNOSTIC_PREFIX[SPEC_CONTEXT_TARGET_FAILURE_KIND.AMBIGUOUS_SEGMENT],
      );
      expect(message).toContain(ambiguity.candidate);
      expect(message).toContain(specTreeFixtureNodeDirectoryName(KIND_REGISTRY, env.fixture.root));
    });
  });

  it("does not use a matching descendant to disambiguate an ambiguous ancestor", async () => {
    await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
      await env.materialize();
      const ambiguity = specContextAmbiguousTargetFixture(env.fixture);
      await env.writeRaw(ambiguity.specPath, "# Ambiguous sibling\n");
      const snapshot = await env.readFilesystemSnapshot();
      const target = specContextNestedAmbiguousTarget(snapshot, ambiguity);
      const message = await rejectedContextMessage(target, env.productDir);
      expect(message).toContain(ambiguity.candidate);
      expect(message).toContain(specTreeFixtureNodeDirectoryName(KIND_REGISTRY, env.fixture.root));
    });
  });

  it("includes configured methodology identity in the manifest", async () => {
    const methodology = generatedMethodologySection();
    await withSpecTreeEnv({
      ...specTreeKindsConfig(),
      [METHODOLOGY_SECTION]: methodology,
    }, async (env) => {
      await env.materialize();
      const snapshot = await env.readFilesystemSnapshot();
      const target = snapshot.allNodes[0];
      const manifest = parseContextManifest(await contextCommand({ targets: [target.id], cwd: env.productDir }));
      expect(manifest.targets).toEqual([rootedSpecPath(target.id)]);
      expect(manifest.productDir).toBe(env.productDir);
      expect(manifest.methodology).toMatchObject({
        source: methodology[METHODOLOGY_CONFIG_FIELDS.SOURCE],
        version: methodology[METHODOLOGY_CONFIG_FIELDS.VERSION],
      });
    });
  });

  it("carries the manifest schema version and the snapshot-derived bootstrap flag", async () => {
    await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
      await env.materialize();
      const snapshot = await env.readFilesystemSnapshot();
      const target = snapshot.allNodes[0];
      const manifest = parseContextManifest(await contextCommand({ targets: [target.id], cwd: env.productDir }));
      expect(manifest.schemaVersion).toBe(SPEC_CONTEXT_MANIFEST_SCHEMA_VERSION);
      expect(manifest.bootstrap).toBe(false);
      expect(projectSpecContextManifest({ ...manifest, nodeCount: 0 }).bootstrap).toBe(true);
      expect(
        projectSpecContextManifest({ ...manifest, nodeCount: snapshot.allNodes.length }).bootstrap,
      ).toBe(false);
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

      const manifest = parseContextManifest(
        await contextCommand({
          targets: [target],
          cwd: env.productDir,
          gitDependencies: trackedSpecContextGitDependencies(env.productDir, trackedPaths),
        }),
      );

      expect(allManifestPaths(manifest)).not.toContain(rootedSpecPath(`${scratch}/${env.fixture.root.slug}.md`));
      expect(allManifestPaths(manifest)).not.toContain(rootedSpecPath(`${target}/PLAN.md`));
    });
  });

  it("reads tracked context from the linked worktree root", async () => {
    await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
      await env.materialize();
      await runGit(env.productDir, [GIT_TEST_SUBCOMMANDS.INIT]);
      await runGit(
        env.productDir,
        [GIT_TEST_SUBCOMMANDS.CONFIG, GIT_TEST_CONFIG.EMAIL_KEY, GIT_TEST_CONFIG.EMAIL],
      );
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
        await runGit(
          env.productDir,
          [
            GIT_TEST_SUBCOMMANDS.WORKTREE,
            GIT_TEST_SUBCOMMANDS.ADD,
            GIT_TEST_FLAGS.NEW_BRANCH,
            `${env.fixture.root.slug}-context`,
            linkedProductDir,
          ],
        );
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
        const manifest = parseContextManifest(await contextCommand({ targets: [target], cwd: nestedCwd }));

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
      const missingChild = `${target.id}/21-metadata-only.enabler`;
      await env.writeRaw(rootedSpecPath(`${missingChild}/${NODE_STATUS_FILENAME}`), "{}");

      const manifest = parseContextManifest(
        await contextCommand({ targets: [missingChild], cwd: env.productDir }),
      );

      expect(manifest.targets).toEqual([`${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${missingChild}`]);
      expect(allManifestPaths(manifest)).not.toContain(
        `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${missingChild}/metadata-only.md`,
      );
    });
  });

  it("renders deterministic spec-tree context as text", async () => {
    await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
      await env.materialize();
      const snapshot = await env.readFilesystemSnapshot();
      const target = snapshot.allNodes[0];
      const textOutput = await contextTextCommand({ targets: [target.id], cwd: env.productDir });
      const jsonOutput = await contextCommand({ targets: [target.id], cwd: env.productDir });
      expect(textOutput).toContain(`${SPEC_CONTEXT_TEXT_LABEL.TARGETS}: spx/${target.id}`);
      expect(textOutput).toContain(`${SPEC_CONTEXT_TEXT_LABEL.PRODUCT_ROOT}: ${env.productDir}`);
      expect(textOutput).toContain(`${SPEC_CONTEXT_TEXT_LABEL.METHODOLOGY}:`);
      expect(textOutput).toContain(
        `${SPEC_CONTEXT_TEXT_LABEL.SCHEMA_VERSION}: ${SPEC_CONTEXT_MANIFEST_SCHEMA_VERSION}`,
      );
      expect(textOutput).toContain(`${SPEC_CONTEXT_TEXT_LABEL.BOOTSTRAP}: false`);
      expect(textOutput).toContain(`${SPEC_CONTEXT_TEXT_LABEL.READ}:`);
      expect(textOutput).toContain(`${SPEC_CONTEXT_TEXT_LABEL.LISTED}:`);
      expect(parseContextManifest(jsonOutput).targets).toEqual([`${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${target.id}`]);
    });
  });

  it("rejects an output mode outside the source-owned text and JSON vocabulary", async () => {
    const invalidFormat = sampleSpecTreeTestValue(arbitraryInvalidSpecContextOutputFormat());
    await expect(
      contextOutputForFormat(invalidFormat as SpecContextOutputFormat, { targets: [], cwd: process.cwd() }),
    ).rejects.toThrow(SPEC_CONTEXT_OUTPUT_FORMAT_MESSAGE.INVALID_PREFIX);
  });

  it("rejects malformed methodology config before manifest output", async () => {
    await withSpecTreeEnv({
      ...specTreeKindsConfig(),
      [METHODOLOGY_SECTION]: {
        [METHODOLOGY_CONFIG_FIELDS.SOURCE]: "",
      },
    }, async (env) => {
      await env.materialize();
      const snapshot = await env.readFilesystemSnapshot();
      const target = snapshot.allNodes[0];
      await expect(contextCommand({ targets: [target.id], cwd: env.productDir })).rejects.toThrow(
        `${METHODOLOGY_SECTION}.${METHODOLOGY_CONFIG_FIELDS.SOURCE}`,
      );
    });
  });

  // The two assertions below witness the CONTEXT COMMAND's wiring to the shared
  // methodology resolver. The resolver's own behavior is owned and deeply tested
  // by the methodology-config node; these exist so a refactor of this command's
  // config path cannot silently drop the legacy-placement rejection or start
  // failing on unrelated config content.
  it("rejects stale harness methodology config before manifest output", async () => {
    await withSpecTreeEnv({
      ...specTreeKindsConfig(),
      [LEGACY_METHODOLOGY_CONFIG_SECTION]: {
        [METHODOLOGY_SECTION]: generatedMethodologySection(),
      },
    }, async (env) => {
      await env.materialize();
      const snapshot = await env.readFilesystemSnapshot();
      const target = snapshot.allNodes[0];
      await expect(contextCommand({ targets: [target.id], cwd: env.productDir })).rejects.toThrow(
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
        unrelated: generatedMethodologySection(),
      },
    }, async (env) => {
      await env.materialize();
      const snapshot = await env.readFilesystemSnapshot();
      const target = snapshot.allNodes[0];
      const manifest = parseContextManifest(await contextCommand({ targets: [target.id], cwd: env.productDir }));
      expect(manifest.methodology).toMatchObject({
        source: methodology[METHODOLOGY_CONFIG_FIELDS.SOURCE],
        version: methodology[METHODOLOGY_CONFIG_FIELDS.VERSION],
      });
    });
  });
});
