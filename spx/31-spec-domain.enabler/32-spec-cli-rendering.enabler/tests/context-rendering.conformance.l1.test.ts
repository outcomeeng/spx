import { describe, expect, it } from "vitest";

import { renderSpecContextEntriesJson } from "@/commands/spec/context-show";
import { renderSpecContextEntries, SPEC_CONTEXT_FRAME, type SpecContextEntry } from "@/lib/spec-tree";
import { contextShowEntries, withRichContextEnv } from "@testing/harnesses/spec/context";

describe("spec context show rendering", () => {
  it("renders the entry stream as ordered text frames and as the equivalent ordered JSON entries without changing selection, metadata, or content", async () => {
    await withRichContextEnv(async (env, paths) => {
      const entries = await contextShowEntries({ targets: [paths.targetId], cwd: env.productDir });
      const text = renderSpecContextEntries(entries);
      // Every entry opens its own frame in stream order; documents carry
      // their content verbatim and references carry only their path.
      let cursor = 0;
      for (const entry of entries) {
        const tag = `<${entry.type === "document" ? SPEC_CONTEXT_FRAME.DOCUMENT : SPEC_CONTEXT_FRAME.REFERENCE}`;
        const position = text.indexOf(tag, cursor);
        expect(position, entry.path).toBeGreaterThanOrEqual(cursor);
        const pathPosition = text.indexOf(entry.path, position);
        expect(pathPosition, entry.path).toBeGreaterThan(position);
        cursor = pathPosition + entry.path.length;
        if (entry.type === "document") expect(text.slice(cursor)).toContain(entry.content);
      }
      const json = JSON.parse(String(renderSpecContextEntriesJson(entries))) as {
        readonly entries: readonly SpecContextEntry[];
      };
      expect(json.entries).toEqual(entries);
    });
  });

  it("renders an empty projection as empty text or an empty entry list", () => {
    expect(renderSpecContextEntries([])).toBe("");
    expect(JSON.parse(String(renderSpecContextEntriesJson([])))).toEqual({ entries: [] });
  });
});
