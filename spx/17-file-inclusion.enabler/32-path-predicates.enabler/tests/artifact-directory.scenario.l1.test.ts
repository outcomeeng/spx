import { describe, expect, it } from "vitest";

import { artifactDirectoryPredicate } from "@/lib/file-inclusion/predicates/artifact-directory";

import { artifactDirConfig, artifactDirs } from "./support";

describe("artifact-directory predicate — scenarios", () => {
  it("a path containing a segment equal to any configured artifact-directory name reports matched: true with that segment as the detail", () => {
    for (const dir of artifactDirs) {
      const result = artifactDirectoryPredicate(`feature/${dir}/some-pkg/index.ts`, artifactDirConfig);
      expect(result.matched, `path with segment "${dir}"`).toBe(true);
      expect(result.detail, `detail for segment "${dir}"`).toBe(dir);
    }
  });

  it("a path containing an artifact-directory segment at the root level reports matched: true", () => {
    const dir = artifactDirs[0];
    const result = artifactDirectoryPredicate(`${dir}/lodash/index.js`, artifactDirConfig);
    expect(result.matched).toBe(true);
    expect(result.detail).toBe(dir);
  });

  it("a path containing an artifact-directory segment at the leaf level reports matched: true", () => {
    const dir = artifactDirs[1];
    const result = artifactDirectoryPredicate(`src/lib/${dir}`, artifactDirConfig);
    expect(result.matched).toBe(true);
    expect(result.detail).toBe(dir);
  });

  it("a path containing no configured artifact-directory segment reports matched: false", () => {
    const result = artifactDirectoryPredicate("src/lib/utils.ts", artifactDirConfig);
    expect(result.matched).toBe(false);
    expect(result.detail).toBeUndefined();
  });

  it("a path that looks similar to an artifact-directory name but is not an exact segment match reports matched: false", () => {
    const result = artifactDirectoryPredicate(`feature/${artifactDirs[0]}_backup/pkg/index.ts`, artifactDirConfig);
    expect(result.matched).toBe(false);
  });

  it("every artifact-directory result carries a layer string identifying the predicate", () => {
    const matched = artifactDirectoryPredicate(`feature/${artifactDirs[0]}/pkg.ts`, artifactDirConfig);
    const unmatched = artifactDirectoryPredicate("src/lib/utils.ts", artifactDirConfig);
    expect(matched.layer.length).toBeGreaterThan(0);
    expect(matched.layer).toBe(unmatched.layer);
  });
});
