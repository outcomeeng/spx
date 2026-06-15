import { basename } from "node:path";

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { worktreeClaimName } from "@/domains/worktree/worktree-name";
import { WORKTREE_TEST_GENERATOR } from "@testing/generators/worktree/worktree";

describe("worktree claim-name derivation", () => {
  it("derives a safe lowercase scope token from any basename", () => {
    fc.assert(
      fc.property(WORKTREE_TEST_GENERATOR.rawBasename(), (raw) => {
        const name = worktreeClaimName(raw);
        expect(name).toMatch(/^[a-z0-9_-]*$/);
        expect(name).toBe(name.toLowerCase());
        expect(name).not.toMatch(/^-|-$/);
        expect(name).not.toMatch(/--/);
        // The name is non-empty exactly when the basename carries a kept
        // character (letter, digit, or underscore); an all-separator basename
        // collapses to the empty string.
        const hasKeptCharacter = /[a-z0-9_]/i.test(basename(raw));
        expect(name.length > 0).toBe(hasKeptCharacter);
      }),
    );
  });

  it("derives the name from the path basename, not the directory portion", () => {
    fc.assert(
      fc.property(WORKTREE_TEST_GENERATOR.worktreeName(), WORKTREE_TEST_GENERATOR.worktreeName(), (parent, leaf) => {
        const path = `/${parent}/${leaf}`;
        expect(worktreeClaimName(path)).toBe(worktreeClaimName(basename(path)));
      }),
    );
  });
});
