import { describe, expect, it } from "vitest";

import { SPEC_CONTEXT_TEXT_LABEL } from "@/commands/spec/context";
import { METHODOLOGY_CONFIG_FIELDS, METHODOLOGY_SECTION } from "@/config/methodology";
import { SPEC_CONTEXT_MANIFEST_SCHEMA_VERSION, type SpecContextManifest } from "@/lib/spec-tree";
import { generatedMigratingMethodologySection } from "@testing/generators/config/descriptors";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import {
  contextListJson,
  contextListManifest,
  contextListText,
  parseContextManifest,
  specTreeKindsConfig,
  withRichContextEnv,
} from "@testing/harnesses/spec/context";

/** The one text line that names `path` as an entry, for the test to judge its role bindings. */
function entryLine(lines: readonly string[], path: string): string | undefined {
  return lines.find((line) => line.endsWith(`: ${path}`) || line.includes(`: ${path} (`));
}

describe("spec context list rendering", () => {
  it("maps one manifest to its JSON and human representations without changing the selected information", async () => {
    await withRichContextEnv(async (env, paths) => {
      const options = { targets: [paths.rootDirectory, paths.targetId], cwd: env.productDir };
      const manifest: SpecContextManifest = await contextListManifest(options);
      expect(parseContextManifest(await contextListJson(options))).toEqual(manifest);
      const lines = (await contextListText(options)).split("\n");
      expect(lines).toContain(`${SPEC_CONTEXT_TEXT_LABEL.TARGETS}: ${manifest.targets.join(", ")}`);
      expect(lines).toContain(`${SPEC_CONTEXT_TEXT_LABEL.PRODUCT_ROOT}: ${manifest.productDir}`);
      expect(lines).toContain(`${SPEC_CONTEXT_TEXT_LABEL.SCHEMA_VERSION}: ${SPEC_CONTEXT_MANIFEST_SCHEMA_VERSION}`);
      expect(lines).toContain(`${SPEC_CONTEXT_TEXT_LABEL.BOOTSTRAP}: ${String(manifest.bootstrap)}`);
      expect(lines).toContain(
        `${SPEC_CONTEXT_TEXT_LABEL.METHODOLOGY}: ${manifest.methodology.source}@${
          String(manifest.methodology.version)
        }`,
      );
      // Each read and each listed entry renders on its own line, beside every
      // role binding the manifest gives that entry and none of another's.
      const readHeading = lines.indexOf(`${SPEC_CONTEXT_TEXT_LABEL.READ}:`);
      const listedHeading = lines.indexOf(`${SPEC_CONTEXT_TEXT_LABEL.LISTED}:`);
      expect(readHeading).toBeGreaterThanOrEqual(0);
      expect(listedHeading).toBeGreaterThan(readHeading);
      const sections = [
        { entries: manifest.read, lines: lines.slice(readHeading + 1, listedHeading) },
        { entries: manifest.listed, lines: lines.slice(listedHeading + 1) },
      ];
      for (const section of sections) {
        expect(section.lines).toHaveLength(section.entries.length);
        for (const entry of section.entries) {
          const line = entryLine(section.lines, entry.path);
          expect(line, entry.path).toBeDefined();
          // The bindings precede the path on the line, comma-separated.
          const rendered = line?.slice(0, line.indexOf(`: ${entry.path}`)).trim().replace(/^- /, "").split(", ");
          expect(new Set(rendered), entry.path).toEqual(
            new Set(entry.roles.map((binding) => `${binding.role}@${binding.target}`)),
          );
        }
      }
      for (const document of manifest.read) {
        for (const citer of document.citedBy ?? []) {
          expect(entryLine(sections[0].lines, document.path), document.path).toContain(citer);
        }
      }
    });
  });

  it("maps an open migration's source into the human representation beside the declared version", async () => {
    const migrating = generatedMigratingMethodologySection();
    await withSpecTreeEnv({ ...specTreeKindsConfig(), [METHODOLOGY_SECTION]: migrating }, async (env) => {
      await env.materialize();
      const target = (await env.readFilesystemSnapshot()).allNodes[0].id;
      const options = { targets: [target], cwd: env.productDir };
      const manifest = await contextListManifest(options);
      expect(parseContextManifest(await contextListJson(options))).toEqual(manifest);
      expect((await contextListText(options)).split("\n")).toContain(
        `${SPEC_CONTEXT_TEXT_LABEL.METHODOLOGY}: ${String(migrating[METHODOLOGY_CONFIG_FIELDS.SOURCE])}@${
          String(migrating[METHODOLOGY_CONFIG_FIELDS.VERSION])
        } (${SPEC_CONTEXT_TEXT_LABEL.MIGRATING_FROM} ${String(migrating[METHODOLOGY_CONFIG_FIELDS.MIGRATING_FROM])})`,
      );
    });
  });
});
