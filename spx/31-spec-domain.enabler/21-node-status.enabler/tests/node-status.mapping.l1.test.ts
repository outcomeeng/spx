import { describe, expect, it } from "vitest";

import { classifyNodeStatus } from "@/lib/node-status";
import { SPEC_TREE_NODE_STATE } from "@/lib/spec-tree/config";

// The classifier is a total function of three booleans, so the finite input cube
// (2^3 = 8 combinations) is the complete mapping. Each row's expected state is the
// precedence contract declared in node-status.md:
//   no tests -> declared; else EXCLUDE-listed -> specified; else tests pass -> passing; else failing.
// Booleans enumerate the finite domain; expected states come from SPEC_TREE_NODE_STATE.

describe("classifyNodeStatus over the full fact cube", () => {
  it("resolves to declared whenever the node has no co-located tests, regardless of other facts", () => {
    for (const isExcluded of [false, true]) {
      for (const testsPass of [false, true]) {
        expect(classifyNodeStatus({ hasTests: false, isExcluded, testsPass })).toBe(
          SPEC_TREE_NODE_STATE.DECLARED,
        );
      }
    }
  });

  it("resolves a tested, EXCLUDE-listed node to specified, regardless of test outcome", () => {
    for (const testsPass of [false, true]) {
      expect(classifyNodeStatus({ hasTests: true, isExcluded: true, testsPass })).toBe(
        SPEC_TREE_NODE_STATE.SPECIFIED,
      );
    }
  });

  it("resolves a tested, non-excluded node whose tests pass to passing", () => {
    expect(classifyNodeStatus({ hasTests: true, isExcluded: false, testsPass: true })).toBe(
      SPEC_TREE_NODE_STATE.PASSING,
    );
  });

  it("resolves a tested, non-excluded node whose tests do not pass to failing", () => {
    expect(classifyNodeStatus({ hasTests: true, isExcluded: false, testsPass: false })).toBe(
      SPEC_TREE_NODE_STATE.FAILING,
    );
  });
});
