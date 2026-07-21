import { describe, expect, it } from "vitest";

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
});
