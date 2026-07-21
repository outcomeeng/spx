import { describe, expect, it } from "vitest";

import { formatMissingCitedDecisionError, SPEC_CONTEXT_READ_ROLE } from "@/lib/spec-tree";
import { specContextTraversalCitationShapes } from "@testing/generators/spec-tree/context-target";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import {
  allManifestPaths,
  contextCommand,
  parseContextManifest,
  rootedSpecPath,
  specTreeKindsConfig,
  withRichContextEnv,
} from "@testing/harnesses/spec/context";

describe("spec context cited decisions", () => {
  it("includes transitively cited decisions once each with citing-file provenance", async () => {
    await withRichContextEnv(async (env, paths) => {
      const manifest = parseContextManifest(
        await contextCommand({ targets: [paths.targetId], cwd: env.productDir }),
      );
      const citedEntries = manifest.read.filter(
        (document) => document.roles.some((binding) => binding.role === SPEC_CONTEXT_READ_ROLE.CITED_DECISION),
      );
      expect(citedEntries).toEqual([
        {
          path: paths.citedDecisionPath,
          roles: [{ target: rootedSpecPath(paths.targetId), role: SPEC_CONTEXT_READ_ROLE.CITED_DECISION }],
          // The target spec and the lower-index sibling both cite this decision;
          // provenance accumulates every citer once, in read order.
          citedBy: [paths.targetSpecPath, paths.lowerSiblingSpecPath],
        },
        {
          path: paths.transitiveCitedDecisionPath,
          roles: [{ target: rootedSpecPath(paths.targetId), role: SPEC_CONTEXT_READ_ROLE.CITED_DECISION }],
          citedBy: [paths.citedDecisionPath],
        },
      ]);
    });
  });

  it("fails naming the cited path and the citing document when a cited decision is absent", async () => {
    await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
      await env.materialize();
      const snapshot = await env.readFilesystemSnapshot();
      const target = snapshot.allNodes[0];
      const targetSpecPath = target.ref?.path;
      expect(targetSpecPath).toBeDefined();
      const missingCitedPath = rootedSpecPath(`${target.id}/98-absent.adr.md`);
      await env.writeRaw(targetSpecPath as string, `# ${target.slug}\n\nGoverned by ${missingCitedPath}\n`);

      await expect(contextCommand({ targets: [target.id], cwd: env.productDir })).rejects.toThrow(
        formatMissingCitedDecisionError(missingCitedPath, targetSpecPath as string),
      );
    });
  });

  it("binds no read entry for a citation-shaped path carrying a relative segment", async () => {
    await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
      await env.materialize();
      const snapshot = await env.readFilesystemSnapshot();
      const target = snapshot.allNodes[0];
      const targetSpecPath = target.ref?.path;
      expect(targetSpecPath).toBeDefined();
      // The suffix-extended shapes would bind their truncated decision-path
      // prefix, and the embedded shape would bind its tree-rooted tail —
      // decisions no tracked file satisfies, failing the command — if the
      // citation pattern matched past the decision suffix or inside a longer
      // path.
      const shapes = specContextTraversalCitationShapes();
      await env.writeRaw(
        targetSpecPath as string,
        `# ${target.slug}\n\nMentions ${shapes.proseShapes.join(", ")} without binding any of them.\n`,
      );

      const manifest = parseContextManifest(
        await contextCommand({ targets: [target.id], cwd: env.productDir, content: true }),
      );

      expect(allManifestPaths(manifest).some((path) => path.includes(".."))).toBe(false);
      expect(allManifestPaths(manifest)).not.toContain(shapes.unboundDecisionPath);
    });
  });
});
