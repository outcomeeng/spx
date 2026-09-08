import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { FOUNDATION_MANIFEST_FIELDS, FOUNDATION_MANIFEST_SCHEMA_VERSION } from "@/lib/methodology/foundation-manifest";
import { SPEC_CONTEXT_CONTENT_FIELDS, SPEC_CONTEXT_LISTED_ROLE } from "@/lib/spec-tree";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import {
  contextCommand,
  listedPathsForRole,
  methodologyPackageConfig,
  parseContextManifest,
  rootedSpecPath,
  writeMethodologyPackage,
} from "@testing/harnesses/spec/context";

describe("spec context methodology catalog", () => {
  it("maps each extended reference, template, and example to a listed methodology-catalog entry carrying no body", async () => {
    await withSpecTreeEnv(methodologyPackageConfig(), async (env) => {
      await env.materialize();
      const fixture = await writeMethodologyPackage(env);
      const snapshot = await env.readFilesystemSnapshot();
      const target = snapshot.allNodes[0];

      const manifest = parseContextManifest(
        await contextCommand({ targets: [target.id], cwd: env.productDir, understand: true }),
      );

      expect(listedPathsForRole(manifest, SPEC_CONTEXT_LISTED_ROLE.METHODOLOGY_CATALOG)).toEqual(
        fixture.catalogPaths,
      );
      for (const catalogPath of fixture.catalogPaths) {
        const entry = manifest.listed.find((candidate) => candidate.path === catalogPath);
        expect(entry?.roles).toEqual([
          { target: rootedSpecPath(target.id), role: SPEC_CONTEXT_LISTED_ROLE.METHODOLOGY_CATALOG },
        ]);
        for (const field of Object.values(SPEC_CONTEXT_CONTENT_FIELDS)) {
          expect(entry).not.toHaveProperty(field);
        }
      }
      expect(manifest.coverage.at(0)?.listed).toEqual(
        expect.arrayContaining([...fixture.catalogPaths]),
      );
    });
  });

  it("maps a manifest-declared identity with no file on disk to a listed entry unchanged", async () => {
    await withSpecTreeEnv(methodologyPackageConfig(), async (env) => {
      await env.materialize();
      const fixture = await writeMethodologyPackage(env);
      const snapshot = await env.readFilesystemSnapshot();
      const target = snapshot.allNodes[0];
      // Catalog entries are projections of parsed manifest data: an absent
      // resource stays visible instead of being silently dropped, so package
      // breakage the manifest declares is not hidden by the projection.
      const absentCatalogPath = `${fixture.corePath}-absent.md`;
      const manifest = {
        [FOUNDATION_MANIFEST_FIELDS.SCHEMA_VERSION]: FOUNDATION_MANIFEST_SCHEMA_VERSION,
        [FOUNDATION_MANIFEST_FIELDS.CORE]: fixture.corePath,
        [FOUNDATION_MANIFEST_FIELDS.REFERENCES]: [absentCatalogPath],
        [FOUNDATION_MANIFEST_FIELDS.TEMPLATES]: [],
        [FOUNDATION_MANIFEST_FIELDS.EXAMPLES]: [],
      };
      await writeFile(join(env.productDir, fixture.manifestPath), JSON.stringify(manifest));

      const projected = parseContextManifest(
        await contextCommand({ targets: [target.id], cwd: env.productDir, understand: true }),
      );
      expect(listedPathsForRole(projected, SPEC_CONTEXT_LISTED_ROLE.METHODOLOGY_CATALOG)).toEqual([
        absentCatalogPath,
      ]);
    });
  });
});
