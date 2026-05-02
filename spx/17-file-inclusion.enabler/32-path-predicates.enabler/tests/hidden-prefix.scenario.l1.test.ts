import { describe, expect, it } from "vitest";

import { hiddenPrefixPredicate } from "@/lib/file-inclusion/predicates/hidden-prefix";

import { hiddenPrefixConfig } from "./support";

describe("hidden-prefix predicate — scenarios", () => {
  it("a path whose basename starts with the configured hidden prefix reports matched: true", () => {
    const result = hiddenPrefixPredicate("src/lib/.cache", hiddenPrefixConfig);
    expect(result.matched).toBe(true);
  });

  it("a hidden file at the root level reports matched: true", () => {
    const result = hiddenPrefixPredicate(".gitignore", hiddenPrefixConfig);
    expect(result.matched).toBe(true);
  });

  it("a path whose basename does not start with the configured hidden prefix reports matched: false", () => {
    const result = hiddenPrefixPredicate("src/lib/helpers.ts", hiddenPrefixConfig);
    expect(result.matched).toBe(false);
    expect(result.detail).toBeUndefined();
  });

  it("a path with a non-hidden basename even when an ancestor segment is hidden reports matched: false", () => {
    const result = hiddenPrefixPredicate(".cache/subdir/utils.ts", hiddenPrefixConfig);
    expect(result.matched).toBe(false);
  });

  it("a path with a hidden intermediate segment reports matched: false — only the basename is checked", () => {
    const result = hiddenPrefixPredicate("src/.hidden/visible.ts", hiddenPrefixConfig);
    expect(result.matched).toBe(false);
  });

  it("every hidden-prefix result carries a layer string identifying the predicate", () => {
    const matched = hiddenPrefixPredicate(".gitignore", hiddenPrefixConfig);
    const unmatched = hiddenPrefixPredicate("README.md", hiddenPrefixConfig);
    expect(typeof matched.layer).toBe("string");
    expect(matched.layer.length).toBeGreaterThan(0);
    expect(matched.layer).toBe(unmatched.layer);
  });
});
