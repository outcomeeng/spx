import { describe, expect, it } from "vitest";

import { FOUNDATION_MANIFEST_CATALOG_FIELDS } from "@/lib/methodology/foundation-manifest";
import { SPEC_CONTEXT_CONTENT_FIELDS, SPEC_CONTEXT_LISTED_ROLE } from "@/lib/spec-tree";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import {
  contextCommand,
  listedPathsForRole,
  methodologyPackageConfig,
  parseContextManifest,
  rootedSpecPath,
  writeAbsentCatalogMethodologyManifest,
  writeMethodologyPackage,
} from "@testing/harnesses/spec/context";

describe("spec context methodology catalog", () => {
  it.each(FOUNDATION_MANIFEST_CATALOG_FIELDS)(
    "maps the %s catalog to a listed entry carrying no body",
    async (field) => {
      await withSpecTreeEnv(methodologyPackageConfig(), async (env) => {
        await env.materialize();
        const fixture = await writeMethodologyPackage(env, { catalogField: field });
        const snapshot = await env.readFilesystemSnapshot();
        const target = snapshot.allNodes[0];
        const expectedPath = fixture.catalogEntries.find((entry) => entry.field === field)?.path;
        expect(expectedPath).toBeDefined();
        if (expectedPath === undefined) return;

        const manifest = parseContextManifest(
          await contextCommand({ targets: [target.id], cwd: env.productDir, understand: true }),
        );

        expect(listedPathsForRole(manifest, SPEC_CONTEXT_LISTED_ROLE.METHODOLOGY_CATALOG)).toEqual(
          [expectedPath],
        );
        const entry = manifest.listed.find((candidate) => candidate.path === expectedPath);
        expect(entry?.roles).toEqual([
          { target: rootedSpecPath(target.id), role: SPEC_CONTEXT_LISTED_ROLE.METHODOLOGY_CATALOG },
        ]);
        for (const contentField of Object.values(SPEC_CONTEXT_CONTENT_FIELDS)) {
          expect(entry).not.toHaveProperty(contentField);
        }
        expect(manifest.coverage.at(0)?.listed).toEqual(
          expect.arrayContaining([expectedPath]),
        );
      });
    },
  );

  it.each(FOUNDATION_MANIFEST_CATALOG_FIELDS)("keeps an absent %s resource listed unchanged", async (field) => {
    await withSpecTreeEnv(methodologyPackageConfig(), async (env) => {
      await env.materialize();
      const fixture = await writeMethodologyPackage(env);
      const snapshot = await env.readFilesystemSnapshot();
      const target = snapshot.allNodes[0];
      const absent = await writeAbsentCatalogMethodologyManifest(env, fixture, field);

      const projected = parseContextManifest(
        await contextCommand({ targets: [target.id], cwd: env.productDir, understand: true }),
      );
      expect(listedPathsForRole(projected, SPEC_CONTEXT_LISTED_ROLE.METHODOLOGY_CATALOG)).toEqual([
        absent.absentPath,
      ]);
    });
  });
});
