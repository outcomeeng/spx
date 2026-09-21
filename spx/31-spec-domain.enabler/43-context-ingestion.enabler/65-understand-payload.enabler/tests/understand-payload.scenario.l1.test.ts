import { rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { METHODOLOGY_CONFIG_FIELDS } from "@/config/methodology";
import {
  FOUNDATION_MANIFEST_FIELDS,
  FOUNDATION_MANIFEST_RELATIVE_PATH,
  FOUNDATION_MANIFEST_SCHEMA_VERSION,
} from "@/lib/methodology";
import { SPEC_CONTEXT_FRAME } from "@/lib/spec-tree";
import { generatedMigratingMethodologySection } from "@testing/generators/config/descriptors";
import { arbitraryMethodologyLineVersion, arbitraryMethodologyVersion } from "@testing/generators/methodology/tree";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import {
  contextShowEntries,
  contextShowFailure,
  contextShowText,
  entryPaths,
  methodologyFixtureTreeRoot,
  methodologyTreeConfig,
  SPEC_CONTEXT_ESCAPE_TARGET_FILENAME,
  writeMethodologyTree,
} from "@testing/harnesses/spec/context";

describe("spec context understand payload", () => {
  it("emits the core body first as one Full document under the bundle address, and nothing of the manifest or catalog", async () => {
    await withSpecTreeEnv(methodologyTreeConfig(), async (env) => {
      await env.materialize();
      const fixture = await writeMethodologyTree(env);
      const snapshot = await env.readFilesystemSnapshot();
      const target = snapshot.allNodes[0];
      const options = {
        targets: [target.id],
        cwd: env.productDir,
        methodology: true,
        methodologyTreeRoot: fixture.treeRoot,
      };
      const entries = await contextShowEntries(options);
      expect(entries[0]).toEqual({
        type: "document",
        path: fixture.documentPath,
        metadata: {},
        content: fixture.coreText,
      });
      for (const catalogPath of fixture.catalogPaths) {
        expect(entryPaths(entries).some((path) => path.endsWith(catalogPath))).toBe(false);
      }
      expect(entryPaths(entries).some((path) => path.endsWith(FOUNDATION_MANIFEST_RELATIVE_PATH))).toBe(false);
      expect((await contextShowText(options)).startsWith(`<${SPEC_CONTEXT_FRAME.DOCUMENT}`)).toBe(true);
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
      const entries = await contextShowEntries({
        targets: [target.id],
        cwd: env.productDir,
        methodologyTreeRoot: methodologyFixtureTreeRoot(env),
      });
      expect(entries[0]?.path).toBe(snapshot.product?.ref?.path);
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
        const failure = await contextShowFailure({
          targets: [target.id],
          cwd: env.productDir,
          methodology: true,
          methodologyTreeRoot: fixture.treeRoot,
        });
        if (declared.line === fixture.line) {
          expect(failure).toBeUndefined();
          return;
        }
        // The generator derives the line from its own components, so the
        // diagnostic's three named values are checked against an oracle
        // the production parser and formatter never touch.
        expect(failure).toContain(declared.text);
        expect(failure).toContain(declared.line);
        expect(failure).toContain(fixture.line);
      },
    );
  });

  it("serves the declared version's tree while methodology.migratingFrom is declared", async () => {
    const migrating = generatedMigratingMethodologySection();
    await withSpecTreeEnv(methodologyTreeConfig(migrating), async (env) => {
      await env.materialize();
      const fixture = await writeMethodologyTree(env, {
        version: migrating[METHODOLOGY_CONFIG_FIELDS.VERSION] as string,
      });
      const snapshot = await env.readFilesystemSnapshot();
      const target = snapshot.allNodes[0];
      const entries = await contextShowEntries({
        targets: [target.id],
        cwd: env.productDir,
        methodology: true,
        methodologyTreeRoot: fixture.treeRoot,
      });
      expect(entries[0]).toMatchObject({ path: fixture.documentPath, content: fixture.coreText });
    });
  });

  it("serves the declared line's tree when methodology.version is declared in the MAJOR.MINOR form", async () => {
    const declared = sampleGeneratedValue(arbitraryMethodologyLineVersion());
    await withSpecTreeEnv(
      methodologyTreeConfig({ [METHODOLOGY_CONFIG_FIELDS.VERSION]: declared.text }),
      async (env) => {
        await env.materialize();
        const fixture = await writeMethodologyTree(env, { version: declared.text });
        // The generator constructs the line beside the text, so the directory
        // the fixture tree lands in is checked against an oracle the production
        // parser never touches before the read is trusted.
        expect(fixture.line).toBe(declared.line);
        const snapshot = await env.readFilesystemSnapshot();
        const target = snapshot.allNodes[0];
        const entries = await contextShowEntries({
          targets: [target.id],
          cwd: env.productDir,
          methodology: true,
          methodologyTreeRoot: fixture.treeRoot,
        });
        expect(entries[0]).toMatchObject({ path: fixture.documentPath, content: fixture.coreText });
      },
    );
  });

  it("fails naming the resolved manifest path when the manifest is absent or carries an unrecognized schema version", async () => {
    for (
      const corrupt of [
        async (fixture: Awaited<ReturnType<typeof writeMethodologyTree>>) => rm(fixture.manifestPath),
        async (fixture: Awaited<ReturnType<typeof writeMethodologyTree>>) =>
          writeFile(
            fixture.manifestPath,
            JSON.stringify({
              [FOUNDATION_MANIFEST_FIELDS.SCHEMA_VERSION]: FOUNDATION_MANIFEST_SCHEMA_VERSION + 1,
              [FOUNDATION_MANIFEST_FIELDS.CORE]: fixture.corePath,
            }),
          ),
      ]
    ) {
      await withSpecTreeEnv(methodologyTreeConfig(), async (env) => {
        await env.materialize();
        const snapshot = await env.readFilesystemSnapshot();
        const target = snapshot.allNodes[0];
        const fixture = await writeMethodologyTree(env);
        await corrupt(fixture);
        expect(
          await contextShowFailure({
            targets: [target.id],
            cwd: env.productDir,
            methodology: true,
            methodologyTreeRoot: fixture.treeRoot,
          }),
        ).toContain(FOUNDATION_MANIFEST_RELATIVE_PATH);
      });
    }
  });

  it("fails naming the offending resource when the core escapes the tree by path or by symbolic link", async () => {
    await withSpecTreeEnv(methodologyTreeConfig(), async (env) => {
      await env.materialize();
      const snapshot = await env.readFilesystemSnapshot();
      const target = snapshot.allNodes[0];
      const fixture = await writeMethodologyTree(env);
      // The escape target exists and is readable, so only the containment
      // rule stands between the traversal path and its bytes.
      const escapePath = join(fixture.treeRoot, SPEC_CONTEXT_ESCAPE_TARGET_FILENAME);
      await writeFile(escapePath, "# Outside the tree\n");
      const traversal = `../../../${SPEC_CONTEXT_ESCAPE_TARGET_FILENAME}`;
      await writeFile(
        fixture.manifestPath,
        JSON.stringify({
          [FOUNDATION_MANIFEST_FIELDS.SCHEMA_VERSION]: FOUNDATION_MANIFEST_SCHEMA_VERSION,
          [FOUNDATION_MANIFEST_FIELDS.CORE]: traversal,
          [FOUNDATION_MANIFEST_FIELDS.REFERENCES]: [],
          [FOUNDATION_MANIFEST_FIELDS.TEMPLATES]: [],
          [FOUNDATION_MANIFEST_FIELDS.EXAMPLES]: [],
        }),
      );
      const options = {
        targets: [target.id],
        cwd: env.productDir,
        methodology: true,
        methodologyTreeRoot: fixture.treeRoot,
      };
      expect(await contextShowFailure(options)).toContain(traversal);

      const restored = await writeMethodologyTree(env);
      const corePath = join(restored.treeDir, restored.corePath);
      await rm(corePath);
      await symlink(escapePath, corePath);
      expect(await contextShowFailure(options)).toContain(restored.corePath);
    });
  });
});
