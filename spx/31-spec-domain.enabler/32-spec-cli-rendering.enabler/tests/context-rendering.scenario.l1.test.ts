import { describe, expect, it } from "vitest";

import {
  parseSpecContextEntriesJson,
  renderSpecContextEntriesJson,
  SPEC_CONTEXT_ENTRIES_KEY,
} from "@/commands/spec/context-show";
import { renderSpecContextEntries, SPEC_CONTEXT_ENTRY_TYPE, SPEC_CONTEXT_FRAME } from "@/lib/spec-tree";
import { contextShowEntries, documentAt, withRichContextEnv } from "@testing/harnesses/spec/context";

describe("spec context show rendering", () => {
  it("renders the entry stream as ordered text frames and as the equivalent ordered JSON entries without changing selection, metadata, or content", async () => {
    await withRichContextEnv(async (env, paths) => {
      const entries = await contextShowEntries({ targets: [paths.targetId], cwd: env.productDir });
      const text = renderSpecContextEntries(entries);
      // Every entry opens its own frame in stream order; documents carry
      // their metadata and content verbatim and references carry only their path.
      let cursor = 0;
      for (const entry of entries) {
        const tag = `<${
          entry.type === SPEC_CONTEXT_ENTRY_TYPE.DOCUMENT ? SPEC_CONTEXT_FRAME.DOCUMENT : SPEC_CONTEXT_FRAME.REFERENCE
        }`;
        const position = text.indexOf(tag, cursor);
        expect(position, entry.path).toBeGreaterThanOrEqual(cursor);
        const pathPosition = text.indexOf(entry.path, position);
        expect(pathPosition, entry.path).toBeGreaterThan(position);
        cursor = pathPosition + entry.path.length;
        if (entry.type !== SPEC_CONTEXT_ENTRY_TYPE.DOCUMENT) continue;
        const framed = text.slice(cursor);
        const contentPosition = framed.indexOf(entry.content);
        expect(contentPosition, entry.path).toBeGreaterThanOrEqual(0);
        // Selected metadata precedes the content inside the same frame.
        for (const [key, value] of Object.entries(entry.metadata)) {
          const metadataPosition = framed.indexOf(`${key}: ${String(value)}`);
          expect(metadataPosition, `${entry.path} ${key}`).toBeGreaterThanOrEqual(0);
          expect(metadataPosition).toBeLessThan(contentPosition);
        }
      }
      // The fixture target carries selected metadata, so the walk above judged
      // at least one metadata block rather than an empty set.
      expect(Object.keys(documentAt(entries, paths.targetSpecPath)?.metadata ?? {})).toEqual(
        Object.keys(paths.targetSelectedMetadata),
      );
      expect(parseSpecContextEntriesJson(String(renderSpecContextEntriesJson(entries)))).toEqual(entries);
    });
  });

  it("renders an empty projection as empty text or an empty entry list", () => {
    expect(renderSpecContextEntries([])).toHaveLength(0);
    const document = JSON.parse(String(renderSpecContextEntriesJson([]))) as Record<string, unknown>;
    expect(Object.keys(document)).toEqual([SPEC_CONTEXT_ENTRIES_KEY]);
    expect(parseSpecContextEntriesJson(String(renderSpecContextEntriesJson([])))).toHaveLength(0);
  });
});
