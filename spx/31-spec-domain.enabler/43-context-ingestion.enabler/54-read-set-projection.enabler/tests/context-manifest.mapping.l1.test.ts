import { describe, expect, it } from "vitest";

import { SPEC_CONTEXT_LISTED_ROLE, SPEC_CONTEXT_READ_ROLE_ORDER } from "@/lib/spec-tree";
import { richContextListedRoleBindings, richContextReadRoleBindings } from "@testing/generators/spec-tree/rich-context";
import {
  contextListManifest,
  listedPathsForRole,
  readPaths,
  readPathsForRole,
  withRichContextEnv,
} from "@testing/harnesses/spec/context";

describe("spec context manifest entry classes", () => {
  it.each(SPEC_CONTEXT_READ_ROLE_ORDER)("binds every %s entry to the read class", async (role) => {
    await withRichContextEnv(async (env, paths) => {
      const binding = richContextReadRoleBindings(paths)[role];
      const manifest = await contextListManifest({ targets: [binding.targetId], cwd: env.productDir });

      expect(readPathsForRole(manifest, role)).toContain(binding.path);
      for (const document of manifest.read) {
        for (const bound of document.roles) {
          expect(SPEC_CONTEXT_READ_ROLE_ORDER).toContain(bound.role);
        }
      }
    });
  });

  it.each(Object.values(SPEC_CONTEXT_LISTED_ROLE))(
    "binds every %s entry to the listed class and to no read entry",
    async (role) => {
      await withRichContextEnv(async (env, paths) => {
        const binding = richContextListedRoleBindings(paths)[role];
        const manifest = await contextListManifest({ targets: [binding.targetId], cwd: env.productDir });

        expect(listedPathsForRole(manifest, role)).toContain(binding.path);
        expect(readPaths(manifest)).not.toContain(binding.path);
        for (const entry of manifest.listed) {
          for (const bound of entry.roles) {
            expect(Object.values(SPEC_CONTEXT_LISTED_ROLE)).toContain(bound.role);
          }
        }
      });
    },
  );
});
