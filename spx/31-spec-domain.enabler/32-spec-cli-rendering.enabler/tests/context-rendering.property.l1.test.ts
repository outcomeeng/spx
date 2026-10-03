import { describe, expect, it } from "vitest";

import { parse } from "yaml";

import { renderSpecContextEntriesJson, SPEC_CONTEXT_ENTRIES_KEY } from "@/commands/spec/context-show";
import {
  renderSpecContextEntries,
  SPEC_CONTEXT_ENTRY_TYPE,
  SPEC_CONTEXT_FRAME,
  SPEC_CONTEXT_FRAME_SYNTAX,
} from "@/lib/spec-tree";
import { arbitrarySpecContextEntryStream } from "@testing/generators/spec-tree/rich-context";
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
