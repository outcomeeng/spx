import { mkdir, realpath, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { execa } from "execa";
import { expect } from "vitest";

import {
  type ContextOptions,
  SPEC_CONTEXT_DOCUMENT_ROLE,
  SPEC_CONTEXT_TEXT_LABEL,
  type SpecContextManifest,
} from "@/commands/spec/context";
import { METHODOLOGY_CONFIG_FIELDS, METHODOLOGY_SECTION } from "@/config/methodology";
import { LEGACY_METHODOLOGY_CONFIG_SECTION } from "@/config/methodology-placement";
import { SPEC_CONTEXT_TARGET_FAILURE_KIND } from "@/domains/spec/context-target";
import {
  contextOutputForFormat,
  formatSpecContextTargetFailure,
  SPEC_CONTEXT_OUTPUT_FORMAT,
  SPEC_DOMAIN_CLI,
} from "@/interfaces/cli/spec";
import { SPEC_CONTEXT_TARGET_DIAGNOSTIC_PREFIX } from "@/interfaces/cli/spec-context-contract";
import { GIT_ROOT_COMMAND, type GitDependencies } from "@/lib/git/root";
import { TRACKED_PATH_NUL_SEPARATOR } from "@/lib/git/tracked-paths";
import { sanitizeCliArgument } from "@/lib/sanitize-cli-argument";
import type { SpecTreeNode, SpecTreeSnapshot } from "@/lib/spec-tree";
import { KIND_REGISTRY, SPEC_TREE_CONFIG, SPEC_TREE_CONFIG_FIELDS } from "@/lib/spec-tree/config";
import { GIT_WORKTREE_TEST_GENERATOR, sampleGitWorktreeTestValue } from "@testing/generators/git-worktree/git-worktree";
import {
  SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND,
  specContextAbbreviatedTarget as abbreviatedTarget,
  specContextAmbiguousTargetFixture as ambiguousTargetFixture,
  type SpecContextCoordinationNoteName,
  specContextCoordinationNoteTarget as coordinationNoteTarget,
  specContextExactPrefixTargetFixture as exactPrefixTargetFixture,
  specContextLowerSiblingDirectoryName as lowerSiblingDirectoryName,
  specContextNestedAmbiguousTarget as nestedAmbiguousTarget,
  specContextSameIndexSiblingDirectoryName as sameIndexSiblingDirectoryName,
  type SpecContextTargetDiagnosticSafetyCase,
  type SpecContextTargetMappingCase,
} from "@testing/generators/spec-tree/context-target";
import { specTreeFixtureNodeDirectoryName } from "@testing/generators/spec-tree/spec-tree";
import { generatedMethodologySection } from "@testing/harnesses/config/methodology";
import { CLI_PATH, NODE_EXECUTABLE } from "@testing/harnesses/constants";
import { GIT_TEST_CONFIG, GIT_TEST_FLAGS, GIT_TEST_SUBCOMMANDS, runGit } from "@testing/harnesses/git-test-constants";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import { createTempDir, removeTempDir } from "@testing/harnesses/with-temp-dir";

function parseContextManifest(output: string): SpecContextManifest {
  return JSON.parse(output) as SpecContextManifest;
}

function contextCommand(options: ContextOptions): Promise<string> {
  return contextOutputForFormat(SPEC_CONTEXT_OUTPUT_FORMAT.JSON, options);
}

function contextTextCommand(options: ContextOptions): Promise<string> {
  return contextOutputForFormat(SPEC_CONTEXT_OUTPUT_FORMAT.TEXT, options);
}

function trackedSpecContextGitDependencies(productDir: string, trackedPaths: readonly string[]): GitDependencies {
  return {
    execa: async (command, args) => {
      if (
        command === GIT_ROOT_COMMAND.EXECUTABLE
        && args.includes(GIT_ROOT_COMMAND.REV_PARSE)
        && args.includes(GIT_ROOT_COMMAND.SHOW_TOPLEVEL)
      ) {
        return { exitCode: 0, stdout: productDir, stderr: "" };
      }
      if (command === GIT_ROOT_COMMAND.EXECUTABLE && args.includes("ls-files")) {
        return { exitCode: 0, stdout: trackedPaths.join(TRACKED_PATH_NUL_SEPARATOR), stderr: "" };
      }
      return { exitCode: 128, stdout: "", stderr: "" };
    },
  };
}

async function rejectedContextMessage(target: string, productDir: string): Promise<string> {
  try {
    await contextCommand({ target, cwd: productDir });
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error(`Expected spec context target to be rejected: ${target}`);
}

async function assertSpecContextResolvesTarget(
  selectInput: (snapshot: SpecTreeSnapshot, target: SpecTreeNode) => string,
): Promise<void> {
  await withSpecTreeEnv({
    [SPEC_TREE_CONFIG.SECTION]: {
      [SPEC_TREE_CONFIG_FIELDS.KINDS]: KIND_REGISTRY,
    },
  }, async (env) => {
    await env.materialize();
    const snapshot = await env.readFilesystemSnapshot();
    const target = snapshot.allNodes.find((node) => node.parentId !== undefined) ?? snapshot.allNodes[0];
    const manifest = parseContextManifest(
      await contextCommand({ target: selectInput(snapshot, target), cwd: env.productDir }),
    );
    expect(manifest.target).toBe(`spx/${target.id}`);
  });
}

export function assertSpecContextResolvesCanonicalTarget(): Promise<void> {
  return assertSpecContextResolvesTarget((_snapshot, target) => target.id);
}

export function assertSpecContextResolvesRootedTarget(): Promise<void> {
  return assertSpecContextResolvesTarget((_snapshot, target) => `spx/${target.id}`);
}

export function assertSpecContextResolvesTrailingSeparatorTarget(): Promise<void> {
  return assertSpecContextResolvesTarget((_snapshot, target) => `${target.id}/`);
}

export function assertSpecContextResolvesAbbreviatedTarget(): Promise<void> {
  return assertSpecContextResolvesTarget((snapshot, target) => abbreviatedTarget(snapshot, target));
}

export async function assertSpecContextRejectsUnknownTarget(): Promise<void> {
  await withSpecTreeEnv({
    [SPEC_TREE_CONFIG.SECTION]: {
      [SPEC_TREE_CONFIG_FIELDS.KINDS]: KIND_REGISTRY,
    },
  }, async (env) => {
    await env.materialize();
    const target = `${specTreeFixtureNodeDirectoryName(KIND_REGISTRY, env.fixture.root)}-unknown`;
    const message = await rejectedContextMessage(target, env.productDir);
    expect(message).toContain(target);
    expect(message).toContain(
      SPEC_CONTEXT_TARGET_DIAGNOSTIC_PREFIX[SPEC_CONTEXT_TARGET_FAILURE_KIND.UNKNOWN_SEGMENT],
    );
  });
}

export async function assertSpecContextPrefersExactTarget(): Promise<void> {
  await withSpecTreeEnv({
    [SPEC_TREE_CONFIG.SECTION]: {
      [SPEC_TREE_CONFIG_FIELDS.KINDS]: KIND_REGISTRY,
    },
  }, async (env) => {
    await env.materialize();
    const fixture = exactPrefixTargetFixture(env.fixture);
    await env.writeRaw(fixture.candidateSpecPath, "# Exact-prefix sibling\n");
    const manifest = parseContextManifest(await contextCommand({ target: fixture.target, cwd: env.productDir }));
    expect(manifest.target).toBe(`spx/${fixture.target}`);
  });
}

export async function assertSpecContextRejectsAmbiguousTarget(): Promise<void> {
  await withSpecTreeEnv({
    [SPEC_TREE_CONFIG.SECTION]: {
      [SPEC_TREE_CONFIG_FIELDS.KINDS]: KIND_REGISTRY,
    },
  }, async (env) => {
    await env.materialize();
    const ambiguity = ambiguousTargetFixture(env.fixture);
    await env.writeRaw(ambiguity.specPath, "# Ambiguous sibling\n");
    const message = await rejectedContextMessage(ambiguity.prefix, env.productDir);
    expect(message).toContain(ambiguity.prefix);
    expect(message).toContain(
      SPEC_CONTEXT_TARGET_DIAGNOSTIC_PREFIX[SPEC_CONTEXT_TARGET_FAILURE_KIND.AMBIGUOUS_SEGMENT],
    );
    expect(message).toContain(ambiguity.candidate);
    expect(message).toContain(specTreeFixtureNodeDirectoryName(KIND_REGISTRY, env.fixture.root));
  });
}

export async function assertSpecContextRejectsNestedWholePathDisambiguation(): Promise<void> {
  await withSpecTreeEnv({
    [SPEC_TREE_CONFIG.SECTION]: {
      [SPEC_TREE_CONFIG_FIELDS.KINDS]: KIND_REGISTRY,
    },
  }, async (env) => {
    await env.materialize();
    const ambiguity = ambiguousTargetFixture(env.fixture);
    await env.writeRaw(ambiguity.specPath, "# Ambiguous sibling\n");
    const snapshot = await env.readFilesystemSnapshot();
    const target = nestedAmbiguousTarget(snapshot, ambiguity);
    const message = await rejectedContextMessage(target, env.productDir);
    expect(message).toContain(ambiguity.candidate);
    expect(message).toContain(specTreeFixtureNodeDirectoryName(KIND_REGISTRY, env.fixture.root));
  });
}

export async function assertSpecContextRejectsArtifactTarget(): Promise<void> {
  await withSpecTreeEnv({
    [SPEC_TREE_CONFIG.SECTION]: {
      [SPEC_TREE_CONFIG_FIELDS.KINDS]: KIND_REGISTRY,
    },
  }, async (env) => {
    await env.materialize();
    const snapshot = await env.readFilesystemSnapshot();
    const target = snapshot.allNodes[0];
    const artifact = target.ref?.path;
    expect(artifact).toBeDefined();
    if (artifact === undefined) return;
    const message = await rejectedContextMessage(artifact, env.productDir);
    expect(message).toContain(artifact);
    expect(message).toContain(`spx/${target.id}`);
    expect(message).toContain(
      SPEC_CONTEXT_TARGET_DIAGNOSTIC_PREFIX[SPEC_CONTEXT_TARGET_FAILURE_KIND.ARTIFACT_PATH],
    );
  });
}

export async function assertSpecContextRejectsRootArtifactTarget(): Promise<void> {
  await withSpecTreeEnv({
    [SPEC_TREE_CONFIG.SECTION]: {
      [SPEC_TREE_CONFIG_FIELDS.KINDS]: KIND_REGISTRY,
    },
  }, async (env) => {
    await env.materialize();
    const suffix = KIND_REGISTRY[env.fixture.decision.kind].suffix;
    const artifact = `spx/${env.fixture.decision.order}-${env.fixture.decision.slug}${suffix}`;
    await env.writeRaw(artifact, "# Product-root decision\n");
    const message = await rejectedContextMessage(artifact, env.productDir);
    expect(message).toContain(artifact);
    expect(message).toContain(
      SPEC_CONTEXT_TARGET_DIAGNOSTIC_PREFIX[SPEC_CONTEXT_TARGET_FAILURE_KIND.ROOT_ARTIFACT_PATH],
    );
  });
}

async function assertSpecContextRejectsUnrecognizedNodeDirectoryTarget(target: string): Promise<void> {
  await withSpecTreeEnv({
    [SPEC_TREE_CONFIG.SECTION]: {
      [SPEC_TREE_CONFIG_FIELDS.KINDS]: KIND_REGISTRY,
    },
  }, async (env) => {
    await env.materialize();
    await mkdir(join(env.productDir, SPEC_TREE_CONFIG.ROOT_DIRECTORY, target), { recursive: true });
    const message = await rejectedContextMessage(target, env.productDir);
    expect(message).toContain(target);
    expect(message).toContain(
      SPEC_CONTEXT_TARGET_DIAGNOSTIC_PREFIX[SPEC_CONTEXT_TARGET_FAILURE_KIND.UNKNOWN_SEGMENT],
    );
  });
}

async function assertSpecContextRejectsCoordinationNoteTarget(
  noteName: SpecContextCoordinationNoteName,
): Promise<void> {
  await withSpecTreeEnv({
    [SPEC_TREE_CONFIG.SECTION]: {
      [SPEC_TREE_CONFIG_FIELDS.KINDS]: KIND_REGISTRY,
    },
  }, async (env) => {
    await env.materialize();
    const snapshot = await env.readFilesystemSnapshot();
    const target = snapshot.allNodes[0];
    const artifact = coordinationNoteTarget(target, noteName);
    await env.writeRaw(artifact, "");
    const message = await rejectedContextMessage(artifact, env.productDir);
    expect(message).toContain(artifact);
    expect(message).toContain(`spx/${target.id}`);
    expect(message).toContain(
      SPEC_CONTEXT_TARGET_DIAGNOSTIC_PREFIX[SPEC_CONTEXT_TARGET_FAILURE_KIND.ARTIFACT_PATH],
    );
  });
}

export function assertSpecContextTargetDiagnosticSafetyCase(
  safetyCase: SpecContextTargetDiagnosticSafetyCase,
): void {
  const message = formatSpecContextTargetFailure(safetyCase.failure);
  expect(message).toContain(sanitizeCliArgument(safetyCase.unsafeValue));
  expect(message).not.toContain(safetyCase.unsafeValue);
}

export async function assertSpecContextTargetMappingCase(mappingCase: SpecContextTargetMappingCase): Promise<void> {
  switch (mappingCase.kind) {
    case SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND.CANONICAL:
      await assertSpecContextResolvesCanonicalTarget();
      return;
    case SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND.ROOTED:
      await assertSpecContextResolvesRootedTarget();
      return;
    case SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND.TRAILING_SEPARATOR:
      await assertSpecContextResolvesTrailingSeparatorTarget();
      return;
    case SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND.ABBREVIATED:
      await assertSpecContextResolvesAbbreviatedTarget();
      return;
    case SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND.UNKNOWN:
      await assertSpecContextRejectsUnknownTarget();
      return;
    case SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND.AMBIGUOUS:
      await assertSpecContextRejectsAmbiguousTarget();
      return;
    case SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND.ARTIFACT:
      await assertSpecContextRejectsArtifactTarget();
      return;
    case SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND.ROOT_ARTIFACT:
      await assertSpecContextRejectsRootArtifactTarget();
      return;
    case SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND.PLAN_ARTIFACT:
    case SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND.ISSUES_ARTIFACT:
      await assertSpecContextRejectsCoordinationNoteTarget(mappingCase.kind);
      return;
    case SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND.INVALID_DIRECTORY:
    case SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND.SUPERSEDED_DIRECTORY:
      await assertSpecContextRejectsUnrecognizedNodeDirectoryTarget(mappingCase.directoryName);
  }
}

export async function assertSpecContextCliResolvesAbbreviatedTarget(): Promise<void> {
  await withSpecTreeEnv({
    [SPEC_TREE_CONFIG.SECTION]: {
      [SPEC_TREE_CONFIG_FIELDS.KINDS]: KIND_REGISTRY,
    },
  }, async (env) => {
    await env.materialize();
    const snapshot = await env.readFilesystemSnapshot();
    const target = snapshot.allNodes.find((node) => node.parentId !== undefined) ?? snapshot.allNodes[0];
    const result = await execa(
      NODE_EXECUTABLE,
      [
        CLI_PATH,
        SPEC_DOMAIN_CLI.COMMAND,
        SPEC_DOMAIN_CLI.CONTEXT_COMMAND,
        `spx/${abbreviatedTarget(snapshot, target)}/`,
        SPEC_DOMAIN_CLI.JSON_OPTION,
      ],
      { cwd: env.productDir, reject: false },
    );
    expect(result.exitCode, result.stderr).toBe(0);
    expect(parseContextManifest(result.stdout).target).toBe(`spx/${target.id}`);
  });
}

export async function assertSpecContextManifestIncludesMethodology(): Promise<void> {
  const methodology = generatedMethodologySection();
  await withSpecTreeEnv({
    [SPEC_TREE_CONFIG.SECTION]: {
      [SPEC_TREE_CONFIG_FIELDS.KINDS]: KIND_REGISTRY,
    },
    [METHODOLOGY_SECTION]: methodology,
  }, async (env) => {
    await env.materialize();
    const snapshot = await env.readFilesystemSnapshot();
    const target = snapshot.allNodes[0];
    const manifest = parseContextManifest(await contextCommand({ target: target.id, cwd: env.productDir }));
    expect(manifest.target).toBe(`spx/${target.id}`);
    expect(manifest.productDir).toBe(env.productDir);
    expect(manifest.methodology).toMatchObject({
      source: methodology[METHODOLOGY_CONFIG_FIELDS.SOURCE],
      version: methodology[METHODOLOGY_CONFIG_FIELDS.VERSION],
    });
  });
}

export async function assertSpecContextManifestIncludesDocuments(): Promise<void> {
  await withSpecTreeEnv({
    [SPEC_TREE_CONFIG.SECTION]: {
      [SPEC_TREE_CONFIG_FIELDS.KINDS]: KIND_REGISTRY,
    },
  }, async (env) => {
    await env.materialize();
    const snapshot = await env.readFilesystemSnapshot();
    const target = snapshot.allNodes.find((node) => node.parentId !== undefined) ?? snapshot.allNodes[0];
    const lowerSibling = lowerSiblingDirectoryName(env.fixture);
    const evidencePath = `spx/${target.id}/tests/${target.slug}.scenario.l1.test.ts`;
    const decisionSuffix = KIND_REGISTRY[env.fixture.decision.kind].suffix;
    const targetDecisionPath =
      `spx/${target.id}/${env.fixture.decision.order}-${env.fixture.decision.slug}${decisionSuffix}`;
    const higherTargetDecisionPath =
      `spx/${target.id}/${env.fixture.peer.order}-${env.fixture.decision.slug}${decisionSuffix}`;
    const productDecisionPath = `spx/${env.fixture.decision.order}-${env.fixture.decision.slug}${decisionSuffix}`;
    const higherProductDecisionPath = `spx/${env.fixture.peer.order}-${env.fixture.decision.slug}${decisionSuffix}`;
    const ancestorDecisionPath =
      `spx/${target.parentId}/${env.fixture.decision.order}-${env.fixture.decision.slug}${decisionSuffix}`;
    const higherAncestorDecisionPath =
      `spx/${target.parentId}/${env.fixture.peer.order}-${env.fixture.decision.slug}${decisionSuffix}`;
    await env.writeRaw(`spx/${lowerSibling}/${env.fixture.root.slug}.md`, "# Lower sibling\n");
    await env.writeRaw(`spx/${target.id}/PLAN.md`, "# Plan\n");
    await env.writeRaw(`spx/${target.id}/ISSUES.md`, "# Issues\n");
    await env.writeRaw(evidencePath, "import { describe, it } from \"vitest\";\n");
    await env.writeRaw(targetDecisionPath, "# Target decision\n");
    await env.writeRaw(higherTargetDecisionPath, "# Higher target decision\n");
    await env.writeRaw(productDecisionPath, "# Product decision\n");
    await env.writeRaw(higherProductDecisionPath, "# Higher product decision\n");
    await env.writeRaw(higherAncestorDecisionPath, "# Higher ancestor decision\n");
    const manifest = parseContextManifest(await contextCommand({ target: target.id, cwd: env.productDir }));
    const productPath = snapshot.product?.ref?.path;
    const ancestorPath = snapshot.allNodes.find((node) => node.id === target.parentId)?.ref?.path;
    expect(productPath).toBeDefined();
    expect(ancestorPath).toBeDefined();
    const roles = new Set(manifest.documents.map((document) => document.role));
    expect(manifest.documents).toContainEqual({
      path: productPath,
      role: SPEC_CONTEXT_DOCUMENT_ROLE.PRODUCT,
    });
    expect(manifest.documents).toContainEqual({
      path: ancestorPath,
      role: SPEC_CONTEXT_DOCUMENT_ROLE.ANCESTOR,
    });
    expect(roles.has(SPEC_CONTEXT_DOCUMENT_ROLE.TARGET)).toBe(true);
    expect(roles.has(SPEC_CONTEXT_DOCUMENT_ROLE.DECISION)).toBe(true);
    expect(roles.has(SPEC_CONTEXT_DOCUMENT_ROLE.EVIDENCE)).toBe(true);
    expect(manifest.documents).toContainEqual({
      path: `spx/${target.id}/PLAN.md`,
      role: SPEC_CONTEXT_DOCUMENT_ROLE.COORDINATION,
    });
    expect(manifest.documents).toContainEqual({
      path: `spx/${target.id}/ISSUES.md`,
      role: SPEC_CONTEXT_DOCUMENT_ROLE.COORDINATION,
    });
    expect(manifest.documents).toContainEqual({
      path: `spx/${lowerSibling}/${env.fixture.root.slug}.md`,
      role: SPEC_CONTEXT_DOCUMENT_ROLE.LOWER_INDEX_SIBLING,
    });
    expect(manifest.documents).toContainEqual({
      path: evidencePath,
      role: SPEC_CONTEXT_DOCUMENT_ROLE.EVIDENCE,
    });
    expect(manifest.documents).toContainEqual({
      path: targetDecisionPath,
      role: SPEC_CONTEXT_DOCUMENT_ROLE.DECISION,
    });
    expect(manifest.documents).toContainEqual({
      path: higherTargetDecisionPath,
      role: SPEC_CONTEXT_DOCUMENT_ROLE.DECISION,
    });
    expect(manifest.documents).toContainEqual({
      path: productDecisionPath,
      role: SPEC_CONTEXT_DOCUMENT_ROLE.DECISION,
    });
    expect(manifest.documents).toContainEqual({
      path: ancestorDecisionPath,
      role: SPEC_CONTEXT_DOCUMENT_ROLE.DECISION,
    });
    expect(manifest.documents.map((document) => document.path)).not.toContain(higherProductDecisionPath);
    expect(manifest.documents.map((document) => document.path)).not.toContain(higherAncestorDecisionPath);
    const productIndex = manifest.documents.findIndex((document) =>
      document.role === SPEC_CONTEXT_DOCUMENT_ROLE.PRODUCT
    );
    const targetIndex = manifest.documents.findIndex((document) => document.role === SPEC_CONTEXT_DOCUMENT_ROLE.TARGET);
    expect(productIndex).toBeGreaterThanOrEqual(0);
    expect(targetIndex).toBeGreaterThan(productIndex);
    expect(manifest.documents.length).toBeGreaterThan(0);
  });
}

export async function assertSpecContextManifestListsSameAndHigherSiblings(): Promise<void> {
  await withSpecTreeEnv({
    [SPEC_TREE_CONFIG.SECTION]: {
      [SPEC_TREE_CONFIG_FIELDS.KINDS]: KIND_REGISTRY,
    },
  }, async (env) => {
    await env.materialize();
    const target = specTreeFixtureNodeDirectoryName(KIND_REGISTRY, env.fixture.root);
    const sameIndexSibling = sameIndexSiblingDirectoryName(env.fixture);
    const higherIndexSibling = specTreeFixtureNodeDirectoryName(KIND_REGISTRY, env.fixture.peer);
    await env.writeRaw(`spx/${sameIndexSibling}/${env.fixture.root.slug}-same.md`, "# Same sibling\n");

    const manifest = parseContextManifest(await contextCommand({ target, cwd: env.productDir }));
    const output = await contextTextCommand({ target, cwd: env.productDir });

    expect(manifest.siblings.sameIndex).toContain(`spx/${sameIndexSibling}`);
    expect(manifest.siblings.higherIndex).toContain(`spx/${higherIndexSibling}`);
    expect(manifest.documents.map((document) => document.path)).not.toContain(
      `spx/${sameIndexSibling}/${env.fixture.root.slug}-same.md`,
    );
    expect(manifest.documents.map((document) => document.path)).not.toContain(
      `spx/${higherIndexSibling}/${env.fixture.peer.slug}.md`,
    );
    expect(output).toContain(`${SPEC_CONTEXT_TEXT_LABEL.SAME_INDEX_SIBLINGS}:`);
    expect(output).toContain(`  - spx/${sameIndexSibling}`);
    expect(output).toContain(`${SPEC_CONTEXT_TEXT_LABEL.HIGHER_INDEX_SIBLINGS}:`);
    expect(output).toContain(`  - spx/${higherIndexSibling}`);
  });
}

export async function assertSpecContextManifestIgnoresUntrackedScratchNodes(): Promise<void> {
  await withSpecTreeEnv({
    [SPEC_TREE_CONFIG.SECTION]: {
      [SPEC_TREE_CONFIG_FIELDS.KINDS]: KIND_REGISTRY,
    },
  }, async (env) => {
    await env.materialize();
    const trackedSnapshot = await env.readFilesystemSnapshot();
    const trackedPaths = trackedSnapshot.entries
      .map((entry) => entry.ref?.path)
      .filter((path): path is string => path !== undefined);
    const target = specTreeFixtureNodeDirectoryName(KIND_REGISTRY, env.fixture.peer);
    const scratch = lowerSiblingDirectoryName(env.fixture);
    await env.writeRaw(`spx/${scratch}/${env.fixture.root.slug}.md`, "# Scratch\n");
    await env.writeRaw(`spx/${target}/PLAN.md`, "# Scratch plan\n");

    const manifest = parseContextManifest(
      await contextCommand({
        target,
        cwd: env.productDir,
        gitDependencies: trackedSpecContextGitDependencies(env.productDir, trackedPaths),
      }),
    );

    expect(manifest.documents.map((document) => document.path)).not.toContain(
      `spx/${scratch}/${env.fixture.root.slug}.md`,
    );
    expect(manifest.documents.map((document) => document.path)).not.toContain(`spx/${target}/PLAN.md`);
  });
}

export async function assertSpecContextUsesLinkedWorktreeRoot(): Promise<void> {
  await withSpecTreeEnv({
    [SPEC_TREE_CONFIG.SECTION]: {
      [SPEC_TREE_CONFIG_FIELDS.KINDS]: KIND_REGISTRY,
    },
  }, async (env) => {
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
      const linkedProductDir = join(linkedParent, "worktree");
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
      const scratch = lowerSiblingDirectoryName(env.fixture);
      const scratchPath = `spx/${scratch}/${env.fixture.root.slug}.md`;
      await mkdir(dirname(join(linkedProductDir, scratchPath)), { recursive: true });
      await writeFile(join(linkedProductDir, scratchPath), "# Untracked scratch\n");

      const target = specTreeFixtureNodeDirectoryName(KIND_REGISTRY, env.fixture.root);
      const manifest = parseContextManifest(await contextCommand({ target, cwd: nestedCwd }));

      expect(manifest.productDir).toBe(await realpath(linkedProductDir));
      expect(manifest.target).toBe(`spx/${target}`);
      expect(manifest.documents.map((document) => document.path)).not.toContain(scratchPath);
    } finally {
      await removeTempDir(linkedParent);
    }
  });
}

export async function assertSpecContextManifestOmitsMissingNodeSpecs(): Promise<void> {
  await withSpecTreeEnv({
    [SPEC_TREE_CONFIG.SECTION]: {
      [SPEC_TREE_CONFIG_FIELDS.KINDS]: KIND_REGISTRY,
    },
  }, async (env) => {
    await env.materialize();
    const snapshot = await env.readFilesystemSnapshot();
    const target = snapshot.allNodes[0];
    const missingChild = `${target.id}/21-metadata-only.enabler`;
    await env.writeRaw(`spx/${missingChild}/spx.status.json`, "{}");

    const manifest = parseContextManifest(await contextCommand({ target: missingChild, cwd: env.productDir }));

    expect(manifest.target).toBe(`spx/${missingChild}`);
    expect(manifest.documents.map((document) => document.path)).not.toContain(
      `spx/${missingChild}/metadata-only.md`,
    );
  });
}

export async function assertSpecContextTextIncludesContext(): Promise<void> {
  await withSpecTreeEnv({
    [SPEC_TREE_CONFIG.SECTION]: {
      [SPEC_TREE_CONFIG_FIELDS.KINDS]: KIND_REGISTRY,
    },
  }, async (env) => {
    await env.materialize();
    const snapshot = await env.readFilesystemSnapshot();
    const target = snapshot.allNodes[0];
    const textOutput = await contextOutputForFormat(
      SPEC_CONTEXT_OUTPUT_FORMAT.TEXT,
      { target: target.id, cwd: env.productDir },
    );
    const jsonOutput = await contextOutputForFormat(
      SPEC_CONTEXT_OUTPUT_FORMAT.JSON,
      { target: target.id, cwd: env.productDir },
    );
    expect(textOutput).toContain(`${SPEC_CONTEXT_TEXT_LABEL.TARGET}: spx/${target.id}`);
    expect(textOutput).toContain(`${SPEC_CONTEXT_TEXT_LABEL.PRODUCT_ROOT}: ${env.productDir}`);
    expect(textOutput).toContain(`${SPEC_CONTEXT_TEXT_LABEL.METHODOLOGY}:`);
    expect(textOutput).toContain(`${SPEC_CONTEXT_TEXT_LABEL.DOCUMENTS}:`);
    expect(parseContextManifest(jsonOutput).target).toBe(`spx/${target.id}`);
  });
}

export async function assertSpecContextRejectsMalformedMethodologyConfig(): Promise<void> {
  await withSpecTreeEnv({
    [SPEC_TREE_CONFIG.SECTION]: {
      [SPEC_TREE_CONFIG_FIELDS.KINDS]: KIND_REGISTRY,
    },
    [METHODOLOGY_SECTION]: {
      [METHODOLOGY_CONFIG_FIELDS.SOURCE]: "",
    },
  }, async (env) => {
    await env.materialize();
    const snapshot = await env.readFilesystemSnapshot();
    const target = snapshot.allNodes[0];
    await expect(contextCommand({ target: target.id, cwd: env.productDir })).rejects.toThrow(
      `${METHODOLOGY_SECTION}.${METHODOLOGY_CONFIG_FIELDS.SOURCE}`,
    );
  });
}

export async function assertSpecContextRejectsHarnessMethodologyConfig(): Promise<void> {
  await withSpecTreeEnv({
    [SPEC_TREE_CONFIG.SECTION]: {
      [SPEC_TREE_CONFIG_FIELDS.KINDS]: KIND_REGISTRY,
    },
    [LEGACY_METHODOLOGY_CONFIG_SECTION]: {
      [METHODOLOGY_SECTION]: generatedMethodologySection(),
    },
  }, async (env) => {
    await env.materialize();
    const snapshot = await env.readFilesystemSnapshot();
    const target = snapshot.allNodes[0];
    await expect(contextCommand({ target: target.id, cwd: env.productDir })).rejects.toThrow(
      `${LEGACY_METHODOLOGY_CONFIG_SECTION}.${METHODOLOGY_SECTION}`,
    );
  });
}

export async function assertSpecContextIgnoresUnrelatedHarnessConfigDefects(): Promise<void> {
  const methodology = generatedMethodologySection();
  await withSpecTreeEnv({
    [SPEC_TREE_CONFIG.SECTION]: {
      [SPEC_TREE_CONFIG_FIELDS.KINDS]: KIND_REGISTRY,
    },
    [METHODOLOGY_SECTION]: methodology,
    [LEGACY_METHODOLOGY_CONFIG_SECTION]: {
      unrelated: generatedMethodologySection(),
    },
  }, async (env) => {
    await env.materialize();
    const snapshot = await env.readFilesystemSnapshot();
    const target = snapshot.allNodes[0];
    const manifest = parseContextManifest(await contextCommand({ target: target.id, cwd: env.productDir }));
    expect(manifest.methodology).toMatchObject({
      source: methodology[METHODOLOGY_CONFIG_FIELDS.SOURCE],
      version: methodology[METHODOLOGY_CONFIG_FIELDS.VERSION],
    });
  });
}
