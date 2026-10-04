import { describe, expect, it } from "vitest";

import { renderSpecContextEntriesJson, SPEC_CONTEXT_ENTRIES_KEY } from "@/commands/spec/context-show";
import { renderSpecContextEntries } from "@/lib/spec-tree";

describe("spec context show rendering of an empty projection", () => {
  it("renders an empty projection as empty text or an empty entry list", () => {
    expect(renderSpecContextEntries([])).toHaveLength(0);
    const document = JSON.parse(String(renderSpecContextEntriesJson([]))) as Record<string, unknown>;
    expect(document).toEqual({ [SPEC_CONTEXT_ENTRIES_KEY]: [] });
  });
});
