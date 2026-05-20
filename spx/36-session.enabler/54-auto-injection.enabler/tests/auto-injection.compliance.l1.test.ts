import { describe, expect, it } from "vitest";

import { parseSessionMetadata } from "@/domains/session/list";
import { SESSION_FRONT_MATTER } from "@/domains/session/types";

describe("auto-injection compliance", () => {
  it("ALWAYS: specs and files parse as arrays when omitted", () => {
    const metadata = parseSessionMetadata("---\npriority: high\n---\n# Session");

    expect(Array.isArray(metadata.specs)).toBe(true);
    expect(Array.isArray(metadata.files)).toBe(true);
    expect(metadata.specs).toEqual([]);
    expect(metadata.files).toEqual([]);
  });

  it("ALWAYS: specs and files keep only string entries", () => {
    const content = `---
${SESSION_FRONT_MATTER.SPECS}: [one.md, 1, true]
${SESSION_FRONT_MATTER.FILES}: [src/one.ts, false]
---
# Session`;
    const metadata = parseSessionMetadata(content);

    expect(metadata.specs).toEqual(["one.md"]);
    expect(metadata.files).toEqual(["src/one.ts"]);
  });
});
