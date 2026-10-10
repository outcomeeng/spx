import { describe, expect, it } from "vitest";

import { SPEC_CONTEXT_TEXT_LABEL } from "@/commands/spec/context";
import { METHODOLOGY_CONFIG_FIELDS, METHODOLOGY_SECTION, METHODOLOGY_VERSION_FORM } from "@/config/methodology";
import {
  generatedMethodologySource,
  generatedMethodologyVersionFormSections,
  generatedMigratingMethodologyFormCases,
} from "@testing/generators/config/descriptors";
import { rootedSpecPath } from "@testing/generators/spec-tree/rich-context";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import { contextListJson, contextListText, specTreeKindsConfig } from "@testing/harnesses/spec/context";

describe("spec context manifest methodology identity", () => {
  it.each(Object.values(METHODOLOGY_VERSION_FORM))(
    "carries a %s methodology version as declared in JSON and as MAJOR.MINOR in text",
    async (form) => {
      const declared = generatedMethodologyVersionFormSections();
      const methodology = declared.sections[form];
      await withSpecTreeEnv({ ...specTreeKindsConfig(), [METHODOLOGY_SECTION]: methodology }, async (env) => {
        await env.materialize();
        const snapshot = await env.readFilesystemSnapshot();
        const targets = [rootedSpecPath(snapshot.allNodes[0].id)];
        const manifest = JSON.parse(await contextListJson({ targets, cwd: env.productDir })) as {
          readonly methodology: unknown;
        };
        expect(manifest.methodology).toStrictEqual({
          source: methodology[METHODOLOGY_CONFIG_FIELDS.SOURCE],
          version: declared.forms.byForm[form],
        });
        const textOutput = await contextListText({ targets, cwd: env.productDir });
        expect(textOutput.split("\n")).toContain(
          `${SPEC_CONTEXT_TEXT_LABEL.METHODOLOGY}: ${
            methodology[METHODOLOGY_CONFIG_FIELDS.SOURCE]
          }@${declared.forms.line}`,
        );
      });
    },
  );

  it("renders the target and the open migration source as MAJOR.MINOR and carries each exactly as declared in JSON, for every pairing of accepted forms", async () => {
    for (const declared of generatedMigratingMethodologyFormCases()) {
      await withSpecTreeEnv({ ...specTreeKindsConfig(), [METHODOLOGY_SECTION]: declared.section }, async (env) => {
        await env.materialize();
        const snapshot = await env.readFilesystemSnapshot();
        const targets = [rootedSpecPath(snapshot.allNodes[0].id)];
        const label = `${declared.targetForm} migrating from ${declared.sourceForm}`;
        const textOutput = await contextListText({ targets, cwd: env.productDir });
        expect(textOutput.split("\n"), label).toContain(
          `${SPEC_CONTEXT_TEXT_LABEL.METHODOLOGY}: ${
            declared.section[METHODOLOGY_CONFIG_FIELDS.SOURCE]
          }@${declared.target.line} (${SPEC_CONTEXT_TEXT_LABEL.MIGRATING_FROM} ${declared.source.line})`,
        );
        const manifest = JSON.parse(await contextListJson({ targets, cwd: env.productDir })) as {
          readonly methodology: unknown;
        };
        expect(manifest.methodology, label).toStrictEqual({
          source: declared.section[METHODOLOGY_CONFIG_FIELDS.SOURCE],
          version: declared.target.byForm[declared.targetForm],
          migratingFrom: declared.source.byForm[declared.sourceForm],
        });
      });
    }
  });

  it("renders the identity as the source alone while no version is declared", async () => {
    const undeclaredSource = generatedMethodologySource();
    await withSpecTreeEnv({
      ...specTreeKindsConfig(),
      [METHODOLOGY_SECTION]: { [METHODOLOGY_CONFIG_FIELDS.SOURCE]: undeclaredSource },
    }, async (env) => {
      await env.materialize();
      const snapshot = await env.readFilesystemSnapshot();
      const targets = [rootedSpecPath(snapshot.allNodes[0].id)];
      const textOutput = await contextListText({ targets, cwd: env.productDir });
      // The identity line ends at the source: no version separator and no
      // placeholder stands in for the undeclared version.
      expect(textOutput.split("\n")).toContain(`${SPEC_CONTEXT_TEXT_LABEL.METHODOLOGY}: ${undeclaredSource}`);
      const manifest = JSON.parse(await contextListJson({ targets, cwd: env.productDir })) as {
        readonly methodology: unknown;
      };
      expect(manifest.methodology).toStrictEqual({ source: undeclaredSource });
    });
  });
});
