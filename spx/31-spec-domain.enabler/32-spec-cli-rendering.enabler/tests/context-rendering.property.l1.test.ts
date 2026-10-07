import { describe, expect, it } from "vitest";

import { parse } from "yaml";

import {
  renderSpecContextJson,
  renderSpecContextText,
  SPEC_CONTEXT_TEXT_CITED_BY_LAYOUT,
  SPEC_CONTEXT_TEXT_LABEL,
  SPEC_CONTEXT_TEXT_SELECTION_INDENT,
} from "@/commands/spec/context";
import { renderSpecContextEntriesJson, SPEC_CONTEXT_ENTRIES_KEY } from "@/commands/spec/context-show";
import {
  renderSpecContextEntries,
  SPEC_CONTEXT_ENTRY_TYPE,
  SPEC_CONTEXT_FRAME,
  SPEC_CONTEXT_FRAME_SYNTAX,
} from "@/lib/spec-tree";
import {
  arbitrarySpecContextEntryStream,
  arbitrarySpecContextManifest,
} from "@testing/generators/spec-tree/rich-context";
import { assertProperty, PROPERTY_CLASSIFICATION } from "@testing/harnesses/property/property";

describe("spec context show rendering", () => {
  it("renders every projection as its ordered frames in text and as the equivalent ordered JSON entries, with metadata and source content unchanged", async () => {
    await assertProperty(
      arbitrarySpecContextEntryStream(),
      (entries) => {
        const text = renderSpecContextEntries(entries);
        // Read the text back by the frame grammar: entries in projection
        // order, one blank line between them, a document's selected metadata
        // as front matter, then its source content byte for byte.
        const syntax = SPEC_CONTEXT_FRAME_SYNTAX;
        const fenceLine = `${syntax.FRONT_MATTER_FENCE}${syntax.LINE_BREAK}`;
        let cursor = 0;
        entries.forEach((entry, index) => {
          if (index > 0) {
            expect(text.startsWith(syntax.ENTRY_SEPARATOR, cursor), entry.path).toBe(true);
            cursor += syntax.ENTRY_SEPARATOR.length;
          }
          const pathAttribute = `${syntax.PATH_ATTRIBUTE_START}${entry.path}`;
          if (entry.type === SPEC_CONTEXT_ENTRY_TYPE.REFERENCE) {
            const reference =
              `${syntax.OPEN_TAG_START}${SPEC_CONTEXT_FRAME.REFERENCE}${pathAttribute}${syntax.SELF_CLOSING_TAG_END}`;
            expect(text.startsWith(reference, cursor), entry.path).toBe(true);
            cursor += reference.length;
            return;
          }
          const opening =
            `${syntax.OPEN_TAG_START}${SPEC_CONTEXT_FRAME.DOCUMENT}${pathAttribute}${syntax.OPEN_TAG_END}${syntax.LINE_BREAK}`;
          expect(text.startsWith(opening, cursor), entry.path).toBe(true);
          cursor += opening.length;
          if (Object.keys(entry.metadata).length > 0) {
            expect(text.startsWith(fenceLine, cursor), entry.path).toBe(true);
            const close = text.indexOf(`${syntax.LINE_BREAK}${fenceLine}`, cursor);
            expect(close, entry.path).toBeGreaterThan(cursor);
            expect(parse(text.slice(cursor + fenceLine.length, close + 1)), entry.path).toEqual(entry.metadata);
            cursor = close + 1 + fenceLine.length;
          }
          expect(text.startsWith(entry.content, cursor), entry.path).toBe(true);
          cursor += entry.content.length;
          const closing = `${
            entry.content.endsWith(syntax.LINE_BREAK) ? "" : syntax.LINE_BREAK
          }${syntax.CLOSE_TAG_START}${SPEC_CONTEXT_FRAME.DOCUMENT}${syntax.CLOSE_TAG_END}`;
          expect(text.startsWith(closing, cursor), entry.path).toBe(true);
          cursor += closing.length;
        });
        expect(cursor).toBe(text.length);
        // The JSON document carries the same ordered entries, read back by
        // the platform parser rather than the product's own reader.
        const document = JSON.parse(String(renderSpecContextEntriesJson(entries))) as Record<string, unknown>;
        expect(Object.keys(document)).toEqual([SPEC_CONTEXT_ENTRIES_KEY]);
        expect(document[SPEC_CONTEXT_ENTRIES_KEY]).toEqual(entries);
      },
      PROPERTY_CLASSIFICATION.SMALL_L1,
    );
  });
});

describe("spec context list rendering", () => {
  it("renders every manifest as its versioned JSON and human representations without changing the selected information", async () => {
    await assertProperty(
      arbitrarySpecContextManifest(),
      (manifest) => {
        // The JSON document is the manifest itself: read back by the platform
        // parser, every key and value is unchanged, with none added or dropped.
        expect(JSON.parse(String(renderSpecContextJson(manifest)))).toStrictEqual(manifest);

        // The human layout is read by the law the manifest decision states, and
        // by nothing it leaves open. Its trailing lines are one line per entry
        // naming its mode and then its path — continuing, on an entry with
        // citing documents, with the opener, the `cited by` label, the label
        // separator, and every citing path in order joined by the path
        // separator, then the closer — each followed by one indented line per
        // selection naming its reason and then its target, in manifest order.
        const lines = String(renderSpecContextText(manifest)).split("\n");
        const entryBlockLength = manifest.entries.reduce((count, entry) => count + 1 + entry.selections.length, 0);
        const header = lines.slice(0, lines.length - entryBlockLength);
        let line = header.length;
        for (const entry of manifest.entries) {
          const entryLine = lines[line] ?? "";
          const named = `${entry.path}${
            entry.citedBy === undefined
              ? ""
              : `${SPEC_CONTEXT_TEXT_CITED_BY_LAYOUT.OPEN}${SPEC_CONTEXT_TEXT_LABEL.CITED_BY}${SPEC_CONTEXT_TEXT_CITED_BY_LAYOUT.LABEL_SEPARATOR}${
                entry.citedBy.join(SPEC_CONTEXT_TEXT_CITED_BY_LAYOUT.PATH_SEPARATOR)
              }${SPEC_CONTEXT_TEXT_CITED_BY_LAYOUT.CLOSE}`
          }`;
          expect(entryLine.startsWith(entry.mode), entryLine).toBe(true);
          expect(entryLine.endsWith(named), entryLine).toBe(true);
          expect(entryLine.slice(entry.mode.length, entryLine.length - named.length), entryLine).toMatch(/^\s+$/);
          line += 1;
          for (const selection of entry.selections) {
            const selectionLine = lines[line] ?? "";
            const reasoned = selectionLine.slice(SPEC_CONTEXT_TEXT_SELECTION_INDENT.length);
            expect(selectionLine.startsWith(SPEC_CONTEXT_TEXT_SELECTION_INDENT), selectionLine).toBe(true);
            expect(reasoned.startsWith(selection.reason), selectionLine).toBe(true);
            expect(reasoned.endsWith(selection.target), selectionLine).toBe(true);
            expect(reasoned.slice(selection.reason.length, reasoned.length - selection.target.length), selectionLine)
              .toMatch(/^\s+$/);
            line += 1;
          }
        }

        // The lines before the entries label the schema version, the bootstrap
        // flag, and the methodology identity, in that order. The decision
        // declares no separator or methodology layout, so each label is read
        // only as preceding the values it labels on its own line: the
        // methodology source, then its version when declared, then its
        // migration source, labelled as such, exactly when a migration is open.
        // Each version reads as its MAJOR.MINOR prefix, never as declared.
        const { source, version, migratingFrom } = manifest.methodology;
        const shown = (declared: string): string => /^\d+\.\d+/.exec(declared)?.[0] ?? declared;
        const labelled = [
          [SPEC_CONTEXT_TEXT_LABEL.SCHEMA_VERSION, String(manifest.schemaVersion)],
          [SPEC_CONTEXT_TEXT_LABEL.BOOTSTRAP, String(manifest.bootstrap)],
          [
            SPEC_CONTEXT_TEXT_LABEL.METHODOLOGY,
            source,
            ...(version === undefined ? [] : [shown(version)]),
            ...(migratingFrom === undefined ? [] : [SPEC_CONTEXT_TEXT_LABEL.MIGRATING_FROM, shown(migratingFrom)]),
          ],
        ] as const;
        const labelLines = labelled.map(([label, ...values]) => {
          const holders = header.filter((headerLine) => headerLine.includes(label));
          expect(holders, label).toHaveLength(1);
          const holder = holders[0] ?? "";
          let position = holder.indexOf(label) + label.length;
          for (const value of values) {
            const found = holder.indexOf(value, position);
            expect(found, `${label} ${value}`).toBeGreaterThanOrEqual(position);
            position = found + value.length;
          }
          return header.indexOf(holder);
        });
        expect(labelLines).toEqual([...labelLines].sort((left, right) => left - right));
        expect(new Set(labelLines).size).toBe(labelLines.length);
        if (migratingFrom === undefined) {
          expect(header.join("\n")).not.toContain(SPEC_CONTEXT_TEXT_LABEL.MIGRATING_FROM);
        }
        for (const declared of [version, migratingFrom]) {
          if (declared !== undefined && shown(declared) !== declared) {
            expect(header.join("\n"), declared).not.toContain(declared);
          }
        }
      },
      PROPERTY_CLASSIFICATION.SMALL_L1,
    );
  });
});
