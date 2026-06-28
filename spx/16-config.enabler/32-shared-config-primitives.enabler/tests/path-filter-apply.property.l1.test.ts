import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { applyPathFilter } from "@/config/primitives/path-filter";
import { CONFIG_TEST_GENERATOR } from "@testing/generators/config/descriptors";

describe("path filter application", () => {
  it("keeps every path when the filter declares no include or exclude", () => {
    fc.assert(
      fc.property(fc.array(CONFIG_TEST_GENERATOR.key()), (paths) => {
        expect(applyPathFilter(paths, {})).toEqual(paths);
      }),
    );
  });

  it("drops paths under an exclude prefix and keeps paths outside it", () => {
    fc.assert(
      fc.property(CONFIG_TEST_GENERATOR.prefixCohort(), ({ prefix, under, sibling, outside }) => {
        const kept = applyPathFilter([under, sibling, outside], { exclude: [prefix] });

        expect(kept).not.toContain(under);
        expect(kept).toContain(sibling);
        expect(kept).toContain(outside);
      }),
    );
  });

  it("keeps only paths under an include prefix", () => {
    fc.assert(
      fc.property(CONFIG_TEST_GENERATOR.prefixCohort(), ({ prefix, under, sibling, outside }) => {
        expect(applyPathFilter([under, sibling, outside], { include: [prefix] })).toEqual([under]);
      }),
    );
  });

  it("matches a prefix exactly and at a path-segment boundary, not by shared leading text", () => {
    fc.assert(
      fc.property(CONFIG_TEST_GENERATOR.prefixCohort(), ({ prefix, under, sibling }) => {
        // Exact match and segment-boundary match are both excluded; the sibling
        // (shared leading text, no boundary) is retained.
        expect(applyPathFilter([prefix, under, sibling], { exclude: [prefix] })).toEqual([sibling]);
      }),
    );
  });

  it("normalizes separators, leading dot-slash, trailing slashes, and root prefixes", () => {
    fc.assert(
      fc.property(CONFIG_TEST_GENERATOR.prefixCohort(), ({ prefix, under }) => {
        const windowsPrefix = prefix.replaceAll("/", "\\");
        const dottedPrefix = `./${prefix}//`;

        expect(applyPathFilter([under], { include: [dottedPrefix] })).toEqual([under]);
        expect(applyPathFilter([under], { exclude: [windowsPrefix] })).toEqual([]);
        expect(applyPathFilter([under], { include: ["."] })).toEqual([under]);
      }),
    );
  });

  it("intersects include and exclude: keeps only paths the include admits and the exclude does not match", () => {
    fc.assert(
      fc.property(CONFIG_TEST_GENERATOR.prefixCohort(), ({ prefix, under, outside }) => {
        // `under` and `deeperUnder` both sit under the include prefix; excluding
        // `under` drops it while the other admitted path survives, and `outside`
        // is dropped by the include gate — exercising both fields at once.
        const deeperUnder = `${prefix}/${outside}`;
        const kept = applyPathFilter([under, deeperUnder, outside], {
          include: [prefix],
          exclude: [under],
        });

        expect(kept).toEqual([deeperUnder]);
      }),
    );
  });
});
