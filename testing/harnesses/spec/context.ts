import { expect } from "vitest";

import {
  contextCommand,
  contextTextCommand,
  SPEC_CONTEXT_DOCUMENT_ROLE,
  SPEC_CONTEXT_TEXT_LABEL,
  type SpecContextManifest,
} from "@/commands/spec/context";
import { METHODOLOGY_CONFIG_FIELDS, METHODOLOGY_RESOLUTION, METHODOLOGY_SECTION } from "@/config/methodology";
import { KIND_REGISTRY, SPEC_TREE_CONFIG, SPEC_TREE_CONFIG_FIELDS } from "@/lib/spec-tree/config";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";

function parseContextManifest(output: string): SpecContextManifest {
  return JSON.parse(output) as SpecContextManifest;
}

function generatedMethodologySection(): Record<string, unknown> {
  return {
    [METHODOLOGY_CONFIG_FIELDS.SOURCE]: generatedMethodologySource(),
    [METHODOLOGY_CONFIG_FIELDS.VERSION]: sampleConfigTestValue(CONFIG_TEST_GENERATOR.key()),
  };
}

function generatedMethodologySource(): string {
  return [
    sampleConfigTestValue(CONFIG_TEST_GENERATOR.key()),
    sampleConfigTestValue(CONFIG_TEST_GENERATOR.key()),
  ].join("/");
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
    expect(manifest.methodology).toMatchObject({
      source: methodology[METHODOLOGY_CONFIG_FIELDS.SOURCE],
      version: methodology[METHODOLOGY_CONFIG_FIELDS.VERSION],
      resolution: METHODOLOGY_RESOLUTION.CONFIGURED,
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
    await env.writeRaw(`spx/${target.id}/PLAN.md`, "# Plan\n");
    const manifest = parseContextManifest(await contextCommand({ target: target.id, cwd: env.productDir }));
    const roles = new Set(manifest.documents.map((document) => document.role));
    expect(roles.has(SPEC_CONTEXT_DOCUMENT_ROLE.PRODUCT)).toBe(true);
    expect(roles.has(SPEC_CONTEXT_DOCUMENT_ROLE.TARGET)).toBe(true);
    expect(roles.has(SPEC_CONTEXT_DOCUMENT_ROLE.DECISION)).toBe(true);
    expect(manifest.documents).toContainEqual({
      path: `spx/${target.id}/PLAN.md`,
      role: SPEC_CONTEXT_DOCUMENT_ROLE.COORDINATION,
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
