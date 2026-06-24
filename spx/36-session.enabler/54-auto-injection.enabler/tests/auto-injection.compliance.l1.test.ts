import { describe, expect, it } from "vitest";

import { buildSessionFrontMatterContent } from "@/domains/session/create";
import { parseSessionMetadata } from "@/domains/session/list";
import { SESSION_FRONT_MATTER, SESSION_PRIORITY } from "@/domains/session/types";
import { buildSessionMarkdownBody } from "@testing/harnesses/session/harness";

describe("auto-injection compliance", () => {
  it("ALWAYS: specs and files parse as arrays when omitted", () => {
    const content = buildSessionFrontMatterContent([
      `${SESSION_FRONT_MATTER.PRIORITY}: ${SESSION_PRIORITY.HIGH}`,
    ], buildSessionMarkdownBody("omitted arrays"));
    const metadata = parseSessionMetadata(content);

    expect(Array.isArray(metadata.specs)).toBe(true);
    expect(Array.isArray(metadata.files)).toBe(true);
    expect(metadata.specs).toEqual([]);
    expect(metadata.files).toEqual([]);
  });

  it("ALWAYS: specs and files keep only string entries", () => {
    const expectedSpecs = ["auto-one.md"];
    const expectedFiles = ["auto-one.ts"];
    const content = buildSessionFrontMatterContent([
      `${SESSION_FRONT_MATTER.SPECS}: [${expectedSpecs[0]}, 1, true]`,
      `${SESSION_FRONT_MATTER.FILES}: [${expectedFiles[0]}, false]`,
    ], buildSessionMarkdownBody("string entries"));
    const metadata = parseSessionMetadata(content);

    expect(metadata.specs).toEqual(expectedSpecs);
    expect(metadata.files).toEqual(expectedFiles);
  });
});
