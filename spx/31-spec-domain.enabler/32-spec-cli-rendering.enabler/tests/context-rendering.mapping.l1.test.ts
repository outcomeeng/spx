import { describe, expect, it } from "vitest";

import { renderSpecContextJson, renderSpecContextText, SPEC_CONTEXT_TEXT_LABEL } from "@/commands/spec/context";
import { DEFAULT_METHODOLOGY_SOURCE, METHODOLOGY_VERSION_FORM } from "@/config/methodology";
import { arbitraryMethodologyVersionFormsOnDistinctLines } from "@testing/generators/methodology/tree";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { arbitrarySpecContextManifest } from "@testing/generators/spec-tree/rich-context";

describe("spec context list methodology rendering", () => {
  it("renders every declared version form as MAJOR.MINOR in text and as the declared value in JSON, for the target and the migration source", () => {
    for (const versionForm of Object.values(METHODOLOGY_VERSION_FORM)) {
      for (const migrationForm of Object.values(METHODOLOGY_VERSION_FORM)) {
        const [version, migration] = sampleGeneratedValue(arbitraryMethodologyVersionFormsOnDistinctLines());
        const declared = {
          source: DEFAULT_METHODOLOGY_SOURCE,
          version: version.byForm[versionForm],
          migratingFrom: migration.byForm[migrationForm],
        };
        const manifest = { ...sampleGeneratedValue(arbitrarySpecContextManifest()), methodology: declared };

        // The text layout is read only as the labelled values in order: the
        // source, the target version, then the migration label and its version.
        const holders = String(renderSpecContextText(manifest)).split("\n").filter((line) =>
          line.includes(SPEC_CONTEXT_TEXT_LABEL.METHODOLOGY)
        );
        expect(holders, `${versionForm} ${migrationForm}`).toHaveLength(1);
        const holder = holders[0] ?? "";
        let position = holder.indexOf(SPEC_CONTEXT_TEXT_LABEL.METHODOLOGY);
        for (const value of [declared.source, version.line, SPEC_CONTEXT_TEXT_LABEL.MIGRATING_FROM, migration.line]) {
          const found = holder.indexOf(value, position);
          expect(found, `${versionForm} ${migrationForm} ${value}`).toBeGreaterThanOrEqual(position);
          position = found + value.length;
        }
        expect(holder).not.toContain(version.byForm[METHODOLOGY_VERSION_FORM.PATCHED]);
        expect(holder).not.toContain(migration.byForm[METHODOLOGY_VERSION_FORM.PATCHED]);

        // The JSON document carries each version exactly as declared.
        const document = JSON.parse(String(renderSpecContextJson(manifest))) as { readonly methodology: unknown };
        expect(document.methodology, `${versionForm} ${migrationForm}`).toStrictEqual(declared);
      }
    }
  });
});
