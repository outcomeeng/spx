import { rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { SPEC_CONTEXT_TEXT_LABEL } from "@/commands/spec/context";
import { METHODOLOGY_CONFIG_FIELDS } from "@/config/methodology";
import {
  FOUNDATION_MANIFEST_FIELDS,
  FOUNDATION_MANIFEST_RELATIVE_PATH,
  FOUNDATION_MANIFEST_SCHEMA_VERSION,
} from "@/lib/methodology/foundation-manifest";
import { SPEC_CONTEXT_CONTENT_FIELDS, SPEC_CONTEXT_LISTED_ROLE, SPEC_CONTEXT_READ_ROLE } from "@/lib/spec-tree";
import { arbitraryMethodologyVersion } from "@testing/generators/methodology/tree";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import {
  contextCommand,
  contextTextCommand,
  listedPathsForRole,
  methodologyFixtureTreeRoot,
  methodologyTreeConfig,
  parseContextManifest,
  readPathsForRole,
  rootedSpecPath,
  SPEC_CONTEXT_ESCAPE_TARGET_FILENAME,
  writeMethodologyTree,
} from "@testing/harnesses/spec/context";

describe("spec context understand payload", () => {
  it("carries each foundation document with exact content, digest, and byte count in every output mode, ordered after the lifecycle overlay group", async () => {
    await withSpecTreeEnv(methodologyTreeConfig(), async (env) => {
      await env.materialize();
      const fixture = await writeMethodologyTree(env);
      const snapshot = await env.readFilesystemSnapshot();
      const target = snapshot.allNodes[0];

      const manifest = parseContextManifest(
        await contextCommand({
          targets: [target.id],
          cwd: env.productDir,
          understand: true,
          methodologyTreeRoot: fixture.treeRoot,
        }),
      );
      const methodologyEntry = manifest.read.find((document) => document.path === fixture.corePath);
      expect(methodologyEntry?.roles).toEqual([
        { target: rootedSpecPath(target.id), role: SPEC_CONTEXT_READ_ROLE.METHODOLOGY },
      ]);
      // Bodies appear in the machine mode even without content mode — the
      // consumers of the payload have no other access to the foundation.
      expect(methodologyEntry?.content).toBe(fixture.coreText);
      expect(methodologyEntry?.digest).toBeDefined();
      expect(methodologyEntry?.bytes).toBeDefined();
      // The methodology group is ordered after every other read entry.
      expect(manifest.read.at(-1)?.path).toBe(fixture.corePath);
      expect(manifest.coverage.at(0)?.read.at(-1)).toBe(fixture.corePath);

      const contentManifest = parseContextManifest(
        await contextCommand({
          targets: [target.id],
          cwd: env.productDir,
          understand: true,
          content: true,
          methodologyTreeRoot: fixture.treeRoot,
        }),
      );
      expect(
        contentManifest.read.find((document) => document.path === fixture.corePath)?.content,
      ).toBe(fixture.coreText);
      for (const catalogPath of fixture.catalogPaths) {
        const catalogEntry = contentManifest.listed.find((entry) => entry.path === catalogPath);
        expect(catalogEntry).toBeDefined();
        for (const field of Object.values(SPEC_CONTEXT_CONTENT_FIELDS)) {
          expect(catalogEntry).not.toHaveProperty(field);
        }
      }

      const textOutput = await contextTextCommand({
        targets: [target.id],
        cwd: env.productDir,
        understand: true,
        methodologyTreeRoot: fixture.treeRoot,
      });
      expect(textOutput).toContain(`${SPEC_CONTEXT_TEXT_LABEL.METHODOLOGY_DOCUMENT}: ${fixture.corePath}`);
      expect(textOutput).toContain(fixture.coreText);
    });
  });

  it("emits no methodology entry and reads no shipped tree when the payload is not requested", async () => {
    // The injected tree root points at a directory that was never
    // materialized, so any read of the shipped tree would fail the command;
    // success proves the tree is not read.
    await withSpecTreeEnv(methodologyTreeConfig(), async (env) => {
      await env.materialize();
      const snapshot = await env.readFilesystemSnapshot();
      const target = snapshot.allNodes[0];
      const manifest = parseContextManifest(
        await contextCommand({
          targets: [target.id],
          cwd: env.productDir,
          methodologyTreeRoot: methodologyFixtureTreeRoot(env),
        }),
      );
      expect(readPathsForRole(manifest, SPEC_CONTEXT_READ_ROLE.METHODOLOGY)).toEqual([]);
      expect(listedPathsForRole(manifest, SPEC_CONTEXT_LISTED_ROLE.METHODOLOGY_CATALOG)).toEqual([]);
    });
  });

  it("fails naming the declared version and the shipped lines when spx ships no tree for the declared line", async () => {
    const declared = sampleGeneratedValue(arbitraryMethodologyVersion());
    await withSpecTreeEnv(
      methodologyTreeConfig({ [METHODOLOGY_CONFIG_FIELDS.VERSION]: declared.text }),
      async (env) => {
        await env.materialize();
        // The fixture tree serves the fixture version's line; the declared
        // version's line ships only when the two happen to coincide.
        const fixture = await writeMethodologyTree(env);
        const snapshot = await env.readFilesystemSnapshot();
        const target = snapshot.allNodes[0];
        if (declared.line === fixture.line) return;
        // The generator derives the line from its own components, so the
        // diagnostic's three named values are checked against an oracle
        // the production parser and formatter never touch.
        const failure = await contextCommand({
          targets: [target.id],
          cwd: env.productDir,
          understand: true,
          methodologyTreeRoot: fixture.treeRoot,
        }).then(() => undefined, (error: unknown) => (error instanceof Error ? error.message : String(error)));
        expect(failure).toBeDefined();
        expect(failure).toContain(declared.text);
        expect(failure).toContain(declared.line);
        expect(failure).toContain(fixture.line);
      },
    );
  });

  it("fails naming the resolved manifest path when the manifest is absent", async () => {
    await withSpecTreeEnv(methodologyTreeConfig(), async (env) => {
      await env.materialize();
      const snapshot = await env.readFilesystemSnapshot();
      const target = snapshot.allNodes[0];
      const fixture = await writeMethodologyTree(env);
      await rm(fixture.manifestPath);
      await expect(
        contextCommand({
          targets: [target.id],
          cwd: env.productDir,
          understand: true,
          methodologyTreeRoot: fixture.treeRoot,
        }),
      ).rejects.toThrow(FOUNDATION_MANIFEST_RELATIVE_PATH);
    });
  });

  it("fails naming the offending path when the manifest names a core outside the tree", async () => {
    await withSpecTreeEnv(methodologyTreeConfig(), async (env) => {
      await env.materialize();
      const snapshot = await env.readFilesystemSnapshot();
      const target = snapshot.allNodes[0];
      const fixture = await writeMethodologyTree(env);
      // The escape target exists and is readable, so only the containment
      // rule stands between the traversal path and its bytes.
      const escapeText = "# Outside the tree\n";
      await writeFile(join(fixture.treeRoot, SPEC_CONTEXT_ESCAPE_TARGET_FILENAME), escapeText);
      const manifest = {
        [FOUNDATION_MANIFEST_FIELDS.SCHEMA_VERSION]: FOUNDATION_MANIFEST_SCHEMA_VERSION,
        [FOUNDATION_MANIFEST_FIELDS.CORE]: `../../../${SPEC_CONTEXT_ESCAPE_TARGET_FILENAME}`,
        [FOUNDATION_MANIFEST_FIELDS.REFERENCES]: [],
        [FOUNDATION_MANIFEST_FIELDS.TEMPLATES]: [],
        [FOUNDATION_MANIFEST_FIELDS.EXAMPLES]: [],
      };
      await writeFile(fixture.manifestPath, JSON.stringify(manifest));
      // The rejection must name the offending value itself, not merely the
      // failing field, so a traversal defect is distinguishable from any
      // other core-field defect.
      await expect(
        contextCommand({
          targets: [target.id],
          cwd: env.productDir,
          understand: true,
          methodologyTreeRoot: fixture.treeRoot,
        }),
      ).rejects.toThrow(`../../../${SPEC_CONTEXT_ESCAPE_TARGET_FILENAME}`);
    });
  });

  it("fails naming the resource when the core resolves through a symbolic link outside the tree", async () => {
    await withSpecTreeEnv(methodologyTreeConfig(), async (env) => {
      await env.materialize();
      const snapshot = await env.readFilesystemSnapshot();
      const target = snapshot.allNodes[0];
      const fixture = await writeMethodologyTree(env);
      const escapePath = join(fixture.treeRoot, SPEC_CONTEXT_ESCAPE_TARGET_FILENAME);
      await writeFile(escapePath, "# Outside the tree\n");
      const corePath = join(fixture.treeDir, fixture.corePath);
      await rm(corePath);
      await symlink(escapePath, corePath);
      await expect(
        contextCommand({
          targets: [target.id],
          cwd: env.productDir,
          understand: true,
          methodologyTreeRoot: fixture.treeRoot,
        }),
      ).rejects.toThrow(fixture.corePath);
    });
  });

  it("fails naming the resolved manifest path when the manifest carries an unrecognized schema version", async () => {
    await withSpecTreeEnv(methodologyTreeConfig(), async (env) => {
      await env.materialize();
      const snapshot = await env.readFilesystemSnapshot();
      const target = snapshot.allNodes[0];
      const fixture = await writeMethodologyTree(env, { schemaVersion: FOUNDATION_MANIFEST_SCHEMA_VERSION + 1 });
      await expect(
        contextCommand({
          targets: [target.id],
          cwd: env.productDir,
          understand: true,
          methodologyTreeRoot: fixture.treeRoot,
        }),
      ).rejects.toThrow(FOUNDATION_MANIFEST_RELATIVE_PATH);
    });
  });
});
