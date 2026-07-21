import { describe, expect, it } from "vitest";

import { SPEC_CONTEXT_LISTED_ROLE, SPEC_CONTEXT_READ_ROLE, SPEC_CONTEXT_READ_ROLE_ORDER } from "@/lib/spec-tree";
import {
  contextCommand,
  listedPathsForRole,
  parseContextManifest,
  readPaths,
  readPathsForRole,
  withRichContextEnv,
} from "@testing/harnesses/spec/context";

describe("spec context manifest entry classes", () => {
  it("maps every role to its read or listed entry class", async () => {
    await withRichContextEnv(async (env, paths) => {
      const manifest = parseContextManifest(
        await contextCommand({ targets: [paths.targetId], cwd: env.productDir }),
      );

      const readRoles = new Set<string>(SPEC_CONTEXT_READ_ROLE_ORDER);
      for (const document of manifest.read) {
        for (const binding of document.roles) {
          expect(readRoles.has(binding.role)).toBe(true);
        }
      }
      const listedRoles = new Set<string>(Object.values(SPEC_CONTEXT_LISTED_ROLE));
      for (const entry of manifest.listed) {
        for (const binding of entry.roles) {
          expect(listedRoles.has(binding.role)).toBe(true);
        }
      }

      expect(readPathsForRole(manifest, SPEC_CONTEXT_READ_ROLE.PRODUCT)).toContain(paths.productPath);
      expect(readPathsForRole(manifest, SPEC_CONTEXT_READ_ROLE.ANCESTOR)).toContain(paths.rootSpecPath);
      expect(readPathsForRole(manifest, SPEC_CONTEXT_READ_ROLE.TARGET)).toContain(paths.targetSpecPath);
      expect(readPathsForRole(manifest, SPEC_CONTEXT_READ_ROLE.DECISION)).toContain(paths.ancestorDecisionPath);
      expect(readPathsForRole(manifest, SPEC_CONTEXT_READ_ROLE.LOWER_INDEX_SIBLING)).toContain(
        paths.lowerSiblingSpecPath,
      );
      expect(readPathsForRole(manifest, SPEC_CONTEXT_READ_ROLE.COORDINATION)).toContain(paths.rootPlanPath);
      expect(readPathsForRole(manifest, SPEC_CONTEXT_READ_ROLE.CITED_DECISION)).toContain(paths.citedDecisionPath);
      expect(readPathsForRole(manifest, SPEC_CONTEXT_READ_ROLE.LIFECYCLE_OVERLAY)).toContain(
        paths.lifecycleOverlayPath,
      );

      expect(listedPathsForRole(manifest, SPEC_CONTEXT_LISTED_ROLE.EVIDENCE)).toContain(paths.evidencePath);
      expect(listedPathsForRole(manifest, SPEC_CONTEXT_LISTED_ROLE.GUIDE)).toContain(paths.rootGuidePaths[0]);
      expect(listedPathsForRole(manifest, SPEC_CONTEXT_LISTED_ROLE.OVERLAY)).toContain(paths.listedOverlayPath);

      expect(readPaths(manifest)).not.toContain(paths.higherProductDecisionPath);
      expect(readPaths(manifest)).not.toContain(paths.higherAncestorDecisionPath);
      expect(readPaths(manifest)).not.toContain(paths.evidencePath);
      expect(readPaths(manifest)).not.toContain(paths.listedOverlayPath);

      const rootManifest = parseContextManifest(
        await contextCommand({ targets: [paths.rootDirectory], cwd: env.productDir }),
      );
      expect(listedPathsForRole(rootManifest, SPEC_CONTEXT_LISTED_ROLE.SAME_INDEX_SIBLING)).toContain(
        paths.sameIndexSiblingPath,
      );
      expect(listedPathsForRole(rootManifest, SPEC_CONTEXT_LISTED_ROLE.HIGHER_INDEX_SIBLING)).toContain(
        paths.higherIndexSiblingPath,
      );
      expect(readPaths(rootManifest)).not.toContain(paths.sameIndexSiblingSpecPath);
    });
  });

  it("orders read entries by the declared role group order", async () => {
    await withRichContextEnv(async (env, paths) => {
      const manifest = parseContextManifest(
        await contextCommand({ targets: [paths.targetId], cwd: env.productDir }),
      );
      const groupIndexes = manifest.read.map((document) =>
        Math.min(...document.roles.map((binding) => SPEC_CONTEXT_READ_ROLE_ORDER.indexOf(binding.role)))
      );
      for (const groupIndex of groupIndexes) {
        expect(groupIndex).toBeGreaterThanOrEqual(0);
      }
      for (let position = 1; position < groupIndexes.length; position += 1) {
        expect(groupIndexes[position]).toBeGreaterThanOrEqual(groupIndexes[position - 1]);
      }
      const uniquePaths = readPaths(manifest);
      expect(new Set(uniquePaths).size).toBe(uniquePaths.length);
    });
  });
});
