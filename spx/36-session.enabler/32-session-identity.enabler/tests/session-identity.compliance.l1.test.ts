import { describe, expect, it } from "vitest";

import { buildSessionFrontMatterContent } from "@/domains/session/create";
import { DEFAULT_SESSION_METADATA, parseSessionMetadata } from "@/domains/session/list";
import { generateSessionId, SESSION_ID_SEPARATOR } from "@/domains/session/timestamp";
import { SESSION_FRONT_MATTER } from "@/domains/session/types";

describe("session identity compliance", () => {
  it("ALWAYS: session IDs use underscore between date and time and hyphen within components", () => {
    const id = generateSessionId({ now: () => new Date(2026, 0, 13, 8, 1, 5) });

    expect(id).toBe(`2026-01-13${SESSION_ID_SEPARATOR}08-01-05`);
  });

  it("ALWAYS: default metadata contains every required canonical field", () => {
    expect(parseSessionMetadata("# Sparse session")).toEqual(DEFAULT_SESSION_METADATA);
  });

  it("ALWAYS: default array fields are fresh for each parse result", () => {
    const first = parseSessionMetadata("# First sparse session");
    const second = parseSessionMetadata("# Second sparse session");

    first.specs.push("mutated.md");
    first.files.push("src/mutated.ts");

    expect(second.specs).toEqual([]);
    expect(second.files).toEqual([]);
  });

  it("NEVER: session IDs contain colon characters", () => {
    const id = generateSessionId({ now: () => new Date(2026, 0, 13, 8, 1, 5) });

    expect(id).not.toContain(":");
  });

  it("NEVER: parsed metadata returns a tags key", () => {
    const content = buildSessionFrontMatterContent([
      `${SESSION_FRONT_MATTER.PRIORITY}: high`,
      "tags: [old, shape]",
    ], "# Session");
    const metadata = parseSessionMetadata(content) as Record<string, unknown>;

    expect(metadata.tags).toBeUndefined();
  });
});
