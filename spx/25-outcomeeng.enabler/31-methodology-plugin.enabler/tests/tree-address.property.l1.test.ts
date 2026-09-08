import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  FOUNDATION_PLUGIN_NAME,
  METHODOLOGY_TREE_ROOT,
  methodologyLine,
  methodologyTreeRelativeDir,
} from "@/lib/methodology";
import {
  arbitraryCodingAgentName,
  arbitraryMethodologyLine,
  arbitraryMethodologyVersion,
  arbitraryNonVersionText,
  arbitraryUnsafeTreeSegment,
} from "@testing/generators/methodology/tree";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("methodology tree address", () => {
  it("derives the line as the major and minor components of every exact version", () => {
    assertProperty(arbitraryMethodologyVersion(), (version) => {
      expect(methodologyLine(version.text)).toEqual({ ok: true, value: version.line });
    }, { level: PROPERTY_LEVEL.L1 });
  });

  it("yields a failure, never a line, for every value that is not an exact version", () => {
    assertProperty(arbitraryNonVersionText(), (text) => {
      expect(methodologyLine(text).ok).toBe(false);
    }, { level: PROPERTY_LEVEL.L1 });
  });

  it("addresses a tree by line, then coding agent, then plugin name, and nothing else", () => {
    assertProperty(fc.tuple(arbitraryMethodologyLine(), arbitraryCodingAgentName()), ([line, codingAgent]) => {
      expect(methodologyTreeRelativeDir(line, codingAgent)).toEqual({
        ok: true,
        value: [METHODOLOGY_TREE_ROOT, line, codingAgent, FOUNDATION_PLUGIN_NAME].join("/"),
      });
    }, { level: PROPERTY_LEVEL.L1 });
  });

  it("rejects a traversing, separator-bearing, or empty component in either position", () => {
    assertProperty(
      fc.tuple(arbitraryUnsafeTreeSegment(), arbitraryMethodologyLine(), arbitraryCodingAgentName()),
      ([unsafe, line, codingAgent]) => {
        expect(methodologyTreeRelativeDir(unsafe, codingAgent).ok).toBe(false);
        expect(methodologyTreeRelativeDir(line, unsafe).ok).toBe(false);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
