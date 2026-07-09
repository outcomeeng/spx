import { expect } from "vitest";

import {
  contextCommand,
  contextTextCommand,
  SPEC_CONTEXT_DOCUMENT_ROLE,
  SPEC_CONTEXT_TEXT_LABEL,
  type SpecContextManifest,
} from "@/commands/spec/context";
import { METHODOLOGY_CONFIG_FIELDS, METHODOLOGY_SECTION } from "@/config/methodology";
import { LEGACY_METHODOLOGY_CONFIG_SECTION } from "@/config/methodology-placement";
import { GIT_ROOT_COMMAND, type GitDependencies } from "@/lib/git/root";
import { TRACKED_PATH_NUL_SEPARATOR } from "@/lib/git/tracked-paths";
import { KIND_REGISTRY, SPEC_TREE_CONFIG, SPEC_TREE_CONFIG_FIELDS } from "@/lib/spec-tree/config";
import {
  type RepresentativeSpecTreeFixture,
  specTreeFixtureNodeDirectoryName,
} from "@testing/generators/spec-tree/spec-tree";
import { generatedMethodologySection } from "@testing/harnesses/config/methodology";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";

function parseContextManifest(output: string): SpecContextManifest {
  return JSON.parse(output) as SpecContextManifest;
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

function lowerSiblingDirectoryName(fixture: RepresentativeSpecTreeFixture): string {
  const rootDirectory = specTreeFixtureNodeDirectoryName(KIND_REGISTRY, fixture.root);
  const orderPrefix = `${fixture.root.order}-`;
  return `${fixture.root.order - 1}-${rootDirectory.slice(orderPrefix.length)}`;
}

function sameIndexSiblingDirectoryName(fixture: RepresentativeSpecTreeFixture): string {
  const definition = KIND_REGISTRY[fixture.root.kind];
  return `${fixture.root.order}-${fixture.root.slug}-same${definition.suffix}`;
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
    await env.writeRaw(`spx/${lowerSibling}/${env.fixture.root.slug}.md`, "# Lower sibling\n");
    await env.writeRaw(`spx/${target.id}/PLAN.md`, "# Plan\n");
    await env.writeRaw(evidencePath, "import { describe, it } from \"vitest\";\n");
    const manifest = parseContextManifest(await contextCommand({ target: target.id, cwd: env.productDir }));
    const roles = new Set(manifest.documents.map((document) => document.role));
    expect(roles.has(SPEC_CONTEXT_DOCUMENT_ROLE.PRODUCT)).toBe(true);
    expect(roles.has(SPEC_CONTEXT_DOCUMENT_ROLE.TARGET)).toBe(true);
    expect(roles.has(SPEC_CONTEXT_DOCUMENT_ROLE.DECISION)).toBe(true);
    expect(roles.has(SPEC_CONTEXT_DOCUMENT_ROLE.EVIDENCE)).toBe(true);
    expect(manifest.documents).toContainEqual({
      path: `spx/${target.id}/PLAN.md`,
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
    const output = await contextTextCommand({ target: target.id, cwd: env.productDir });
    expect(output).toContain(`${SPEC_CONTEXT_TEXT_LABEL.TARGET}: spx/${target.id}`);
    expect(output).toContain(`${SPEC_CONTEXT_TEXT_LABEL.PRODUCT_ROOT}: ${env.productDir}`);
    expect(output).toContain(`${SPEC_CONTEXT_TEXT_LABEL.METHODOLOGY}:`);
    expect(output).toContain(`${SPEC_CONTEXT_TEXT_LABEL.DOCUMENTS}:`);
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
