import { describe, expect, it } from "vitest";

import { parse } from "yaml";

import { renderSpecContextEntriesJson, SPEC_CONTEXT_ENTRIES_KEY } from "@/commands/spec/context-show";
import { renderSpecContextEntries, SPEC_CONTEXT_ENTRY_TYPE, SPEC_CONTEXT_FRAME } from "@/lib/spec-tree";
import { arbitrarySpecContextEntryStream } from "@testing/generators/spec-tree/rich-context";
import { assertProperty, PROPERTY_CLASSIFICATION } from "@testing/harnesses/property/property";

const FRONT_MATTER_LINE = "---\n";

describe("spec context show rendering", () => {
  it("renders every projection as its ordered frames in text and as the equivalent ordered JSON entries, with metadata and source content unchanged", async () => {
    await assertProperty(
      arbitrarySpecContextEntryStream(),
      (entries) => {
        const text = renderSpecContextEntries(entries);
        // Read the text back by the frame grammar: entries in projection
        // order, one blank line between them, a document's selected metadata
        // as front matter, then its source content byte for byte.
        let cursor = 0;
        entries.forEach((entry, index) => {
          if (index > 0) {
            expect(text.slice(cursor, cursor + 2), entry.path).toBe("\n\n");
            cursor += 2;
          }
          if (entry.type === SPEC_CONTEXT_ENTRY_TYPE.REFERENCE) {
            const reference = `<${SPEC_CONTEXT_FRAME.REFERENCE} path="${entry.path}" />`;
            expect(text.startsWith(reference, cursor), entry.path).toBe(true);
            cursor += reference.length;
            return;
          }
          const opening = `<${SPEC_CONTEXT_FRAME.DOCUMENT} path="${entry.path}">\n`;
          expect(text.startsWith(opening, cursor), entry.path).toBe(true);
          cursor += opening.length;
          if (Object.keys(entry.metadata).length > 0) {
            expect(text.startsWith(FRONT_MATTER_LINE, cursor), entry.path).toBe(true);
            const close = text.indexOf(`\n${FRONT_MATTER_LINE}`, cursor);
            expect(close, entry.path).toBeGreaterThan(cursor);
            expect(parse(text.slice(cursor + FRONT_MATTER_LINE.length, close + 1)), entry.path).toEqual(
              entry.metadata,
            );
            cursor = close + 1 + FRONT_MATTER_LINE.length;
            expect(text[cursor], entry.path).toBe("\n");
            cursor += 1;
          }
          expect(text.startsWith(entry.content, cursor), entry.path).toBe(true);
          cursor += entry.content.length;
          const closing = `${entry.content.endsWith("\n") ? "" : "\n"}</${SPEC_CONTEXT_FRAME.DOCUMENT}>`;
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
