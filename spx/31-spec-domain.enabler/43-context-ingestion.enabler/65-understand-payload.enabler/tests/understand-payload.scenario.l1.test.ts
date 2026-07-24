import { createHash } from "node:crypto";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { SPEC_CONTEXT_TEXT_LABEL } from "@/commands/spec/context";
import {
  FOUNDATION_MANIFEST_RELATIVE_PATH,
  FOUNDATION_MANIFEST_SCHEMA_VERSION,
} from "@/lib/methodology/foundation-manifest";
import {
  SPEC_CONTEXT_CONTENT_FIELDS,
  SPEC_CONTEXT_DIGEST_ALGORITHM,
  SPEC_CONTEXT_LISTED_ROLE,
  SPEC_CONTEXT_READ_ROLE,
} from "@/lib/spec-tree";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import {
  contextCommand,
  contextTextCommand,
  listedPathsForRole,
  makeMethodologyManifestUnreadable,
  methodologyPackageConfig,
  parseContextManifest,
  readPathsForRole,
  removeMethodologyManifest,
  rootedSpecPath,
  writeEscapingCoreMethodologyManifest,
  writeMethodologyPackage,
  writeSymlinkEscapingCoreMethodologyPackage,
} from "@testing/harnesses/spec/context";

describe("spec context understand payload", () => {
  it("carries each foundation document with exact content, digest, and byte count in every output mode, ordered after the lifecycle overlay group", async () => {
    await withSpecTreeEnv(methodologyPackageConfig(), async (env) => {
      await env.materialize();
      const fixture = await writeMethodologyPackage(env);
      const snapshot = await env.readFilesystemSnapshot();
      const target = snapshot.allNodes[0];

      const manifest = parseContextManifest(
        await contextCommand({ targets: [target.id], cwd: env.productDir, understand: true }),
      );
      const methodologyEntry = manifest.read.find((document) => document.path === fixture.corePath);
      expect(methodologyEntry?.roles).toEqual([
        { target: rootedSpecPath(target.id), role: SPEC_CONTEXT_READ_ROLE.METHODOLOGY },
      ]);
      // Bodies appear in the machine mode even without content mode — the
      // consumers of the payload have no other access to the foundation.
      expect(methodologyEntry?.content).toBe(fixture.coreText);
      expect(methodologyEntry?.digest).toBe(
        `${SPEC_CONTEXT_DIGEST_ALGORITHM}:${
          createHash(SPEC_CONTEXT_DIGEST_ALGORITHM).update(fixture.coreText).digest("hex")
        }`,
      );
      expect(methodologyEntry?.bytes).toBe(Buffer.byteLength(fixture.coreText));
      // The methodology group is ordered after every other read entry.
      expect(manifest.read.at(-1)?.path).toBe(fixture.corePath);
      expect(manifest.coverage.at(0)?.read.at(-1)).toBe(fixture.corePath);

      const contentManifest = parseContextManifest(
        await contextCommand({ targets: [target.id], cwd: env.productDir, understand: true, content: true }),
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

      const textOutput = await contextTextCommand({ targets: [target.id], cwd: env.productDir, understand: true });
      expect(textOutput).toContain(`${SPEC_CONTEXT_TEXT_LABEL.METHODOLOGY_DOCUMENT}: ${fixture.corePath}`);
      expect(textOutput).toContain(fixture.coreText);
    });
  });

  it("emits no methodology entry and reads no installed package when the payload is not requested", async () => {
    // The configured package location points at a directory that was never
    // materialized, so any read of the installed package would fail the
    // command; success proves the package is not read.
    await withSpecTreeEnv(methodologyPackageConfig(), async (env) => {
      await env.materialize();
      const snapshot = await env.readFilesystemSnapshot();
      const target = snapshot.allNodes[0];
      const manifest = parseContextManifest(
        await contextCommand({ targets: [target.id], cwd: env.productDir }),
      );
      expect(readPathsForRole(manifest, SPEC_CONTEXT_READ_ROLE.METHODOLOGY)).toEqual([]);
      expect(listedPathsForRole(manifest, SPEC_CONTEXT_LISTED_ROLE.METHODOLOGY_CATALOG)).toEqual([]);
    });
  });

  it("fails naming the resolved manifest path when the manifest is absent", async () => {
    await withSpecTreeEnv(methodologyPackageConfig(), async (env) => {
      await env.materialize();
      const snapshot = await env.readFilesystemSnapshot();
      const target = snapshot.allNodes[0];
      const fixture = await writeMethodologyPackage(env);
      await removeMethodologyManifest(env, fixture);
      await expect(
        contextCommand({ targets: [target.id], cwd: env.productDir, understand: true }),
      ).rejects.toThrow(FOUNDATION_MANIFEST_RELATIVE_PATH);
    });
  });

  it("fails naming the resolved manifest path and expected contract when the manifest is unreadable", async () => {
    await withSpecTreeEnv(methodologyPackageConfig(), async (env) => {
      await env.materialize();
      const snapshot = await env.readFilesystemSnapshot();
      const target = snapshot.allNodes[0];
      const fixture = await writeMethodologyPackage(env);
      await makeMethodologyManifestUnreadable(env, fixture);
      await expect(
        contextCommand({ targets: [target.id], cwd: env.productDir, understand: true }),
      ).rejects.toThrow(join(env.productDir, fixture.manifestPath));
      await expect(
        contextCommand({ targets: [target.id], cwd: env.productDir, understand: true }),
      ).rejects.toThrow(FOUNDATION_MANIFEST_RELATIVE_PATH);
    });
  });

  it("fails naming the offending path when the manifest names a core outside the package", async () => {
    await withSpecTreeEnv(methodologyPackageConfig(), async (env) => {
      await env.materialize();
      const snapshot = await env.readFilesystemSnapshot();
      const target = snapshot.allNodes[0];
      const fixture = await writeMethodologyPackage(env);
      const escaping = await writeEscapingCoreMethodologyManifest(env, fixture);
      await expect(
        contextCommand({ targets: [target.id], cwd: env.productDir, understand: true }),
      ).rejects.toThrow(escaping.offendingPath);
    });
  });

  it("fails naming the resource when the core resolves through a symbolic link outside the package", async () => {
    await withSpecTreeEnv(methodologyPackageConfig(), async (env) => {
      await env.materialize();
      const snapshot = await env.readFilesystemSnapshot();
      const target = snapshot.allNodes[0];
      const fixture = await writeMethodologyPackage(env);
      const escaping = await writeSymlinkEscapingCoreMethodologyPackage(env, fixture);
      await expect(
        contextCommand({ targets: [target.id], cwd: env.productDir, understand: true }),
      ).rejects.toThrow(escaping.offendingPath);
    });
  });

  it("fails naming the resolved manifest path when the manifest carries an unrecognized schema version", async () => {
    await withSpecTreeEnv(methodologyPackageConfig(), async (env) => {
      await env.materialize();
      const snapshot = await env.readFilesystemSnapshot();
      const target = snapshot.allNodes[0];
      await writeMethodologyPackage(env, { schemaVersion: FOUNDATION_MANIFEST_SCHEMA_VERSION + 1 });
      await expect(
        contextCommand({ targets: [target.id], cwd: env.productDir, understand: true }),
      ).rejects.toThrow(FOUNDATION_MANIFEST_RELATIVE_PATH);
    });
  });
});
