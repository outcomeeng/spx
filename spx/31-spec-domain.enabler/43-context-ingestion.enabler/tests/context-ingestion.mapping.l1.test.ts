import { describe, expect, it } from "vitest";

import { SPEC_CONTEXT_TEXT_LABEL } from "@/commands/spec/context";
import { METHODOLOGY_CONFIG_FIELDS, METHODOLOGY_SECTION, METHODOLOGY_VERSION_FORM } from "@/config/methodology";
import {
  generatedMethodologyVersionFormSections,
  generatedMigratingMethodologySection,
} from "@testing/generators/config/descriptors";
import { rootedSpecPath } from "@testing/generators/spec-tree/rich-context";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import { contextListManifest, contextListText, specTreeKindsConfig } from "@testing/harnesses/spec/context";

describe("spec context manifest methodology identity", () => {
  it.each(Object.values(METHODOLOGY_VERSION_FORM))(
    "carries a %s methodology version into the manifest",
    async (form) => {
      const declared = generatedMethodologyVersionFormSections();
      const methodology = declared.sections[form];
      await withSpecTreeEnv({ ...specTreeKindsConfig(), [METHODOLOGY_SECTION]: methodology }, async (env) => {
        await env.materialize();
        const snapshot = await env.readFilesystemSnapshot();
        const target = snapshot.allNodes[0];
        const manifest = await contextListManifest({ targets: [rootedSpecPath(target.id)], cwd: env.productDir });
        expect(manifest.methodology).toMatchObject({
          source: methodology[METHODOLOGY_CONFIG_FIELDS.SOURCE],
          version: declared.forms.byForm[form],
        });
      });
    },
  );

  it("renders the migration source beside the identity while a migration is open", async () => {
    const migrating = generatedMigratingMethodologySection();
    await withSpecTreeEnv({ ...specTreeKindsConfig(), [METHODOLOGY_SECTION]: migrating }, async (env) => {
      await env.materialize();
      const snapshot = await env.readFilesystemSnapshot();
      const target = snapshot.allNodes[0];
      const textOutput = await contextListText({ targets: [target.id], cwd: env.productDir });
      expect(textOutput.split("\n")).toContain(
        `${SPEC_CONTEXT_TEXT_LABEL.METHODOLOGY}: ${migrating[METHODOLOGY_CONFIG_FIELDS.SOURCE]}@${
          migrating[METHODOLOGY_CONFIG_FIELDS.VERSION]
        } (${SPEC_CONTEXT_TEXT_LABEL.MIGRATING_FROM} ${migrating[METHODOLOGY_CONFIG_FIELDS.MIGRATING_FROM]})`,
      );
    });
  });
});
