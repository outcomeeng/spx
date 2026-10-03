import { describe, expect, it } from "vitest";

import { SPEC_CONTEXT_TEXT_LABEL, SPEC_CONTEXT_TEXT_SELECTION_INDENT } from "@/commands/spec/context";
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

describe("spec context list rendering", () => {
  it("maps one manifest to its JSON and human representations without changing the selected information", async () => {
    await withRichContextEnv(async (env, paths) => {
      const options = { targets: [paths.rootDirectory, paths.targetId], cwd: env.productDir };
      const manifest: SpecContextManifest = await contextListManifest(options);
      // The scenario reaches every manifest field the layouts render: several
      // targets selecting one entry, and a decision reached only by citation.
      expect(manifest.schemaVersion).toBe(SPEC_CONTEXT_MANIFEST_SCHEMA_VERSION);
      expect(manifest.entries.some((entry) => entry.selections.length > 1)).toBe(true);
      expect(manifest.entries.some((entry) => entry.citedBy !== undefined)).toBe(true);

      // The JSON document is the manifest itself: every key and value it
      // carries reads back unchanged, with no key added or dropped.
      expect(parseContextManifest(await contextListJson(options))).toStrictEqual(manifest);

      // The human layout labels the schema version, bootstrap flag, and
      // methodology, then gives each entry one `<mode> <path>` line followed by
      // one indented `<reason> <target>` line per selection, in manifest order.
      expect((await contextListText(options)).split("\n")).toEqual([
        `${SPEC_CONTEXT_TEXT_LABEL.SCHEMA_VERSION}: ${String(manifest.schemaVersion)}`,
        `${SPEC_CONTEXT_TEXT_LABEL.BOOTSTRAP}: ${String(manifest.bootstrap)}`,
        `${SPEC_CONTEXT_TEXT_LABEL.METHODOLOGY}: ${manifest.methodology.source}@${
          String(manifest.methodology.version)
        }`,
        ...manifest.entries.flatMap((entry) => [
          `${entry.mode} ${entry.path}${
            entry.citedBy === undefined ? "" : ` (${SPEC_CONTEXT_TEXT_LABEL.CITED_BY} ${entry.citedBy.join(", ")})`
          }`,
          ...entry.selections.map((selection) =>
            `${SPEC_CONTEXT_TEXT_SELECTION_INDENT}${selection.reason} ${selection.target}`
          ),
        ]),
      ]);
    });
  });

  it("maps an open migration's source into the human representation beside the declared version", async () => {
    const migrating = generatedMigratingMethodologySection();
    await withSpecTreeEnv({ ...specTreeKindsConfig(), [METHODOLOGY_SECTION]: migrating }, async (env) => {
      await env.materialize();
      const target = (await env.readFilesystemSnapshot()).allNodes[0].id;
      const options = { targets: [target], cwd: env.productDir };
      const manifest = await contextListManifest(options);
      expect(parseContextManifest(await contextListJson(options))).toStrictEqual(manifest);
      expect((await contextListText(options)).split("\n")).toContain(
        `${SPEC_CONTEXT_TEXT_LABEL.METHODOLOGY}: ${String(migrating[METHODOLOGY_CONFIG_FIELDS.SOURCE])}@${
          String(migrating[METHODOLOGY_CONFIG_FIELDS.VERSION])
        } (${SPEC_CONTEXT_TEXT_LABEL.MIGRATING_FROM} ${String(migrating[METHODOLOGY_CONFIG_FIELDS.MIGRATING_FROM])})`,
      );
    });
  });
});
