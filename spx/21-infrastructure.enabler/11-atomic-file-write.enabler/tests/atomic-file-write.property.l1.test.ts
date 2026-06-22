import { dirname } from "node:path";

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { atomicWriteTempPath, type RandomBytes } from "@/lib/atomic-file-write";

const safeSegment = fc.string({ minLength: 1, maxLength: 12 }).filter(
  (s) => !s.includes("/") && s !== "." && s !== "..",
);

const targetPathArb = fc
  .tuple(fc.array(safeSegment, { minLength: 0, maxLength: 4 }), safeSegment)
  .map(([dirs, base]) => `/${[...dirs, base].join("/")}`);

const fixedBytes = (bytes: Uint8Array): RandomBytes => () => Buffer.from(bytes);

describe("atomicWriteTempPath sibling invariant", () => {
  it("places the temp path in the target's own directory so the rename is intra-filesystem", () => {
    fc.assert(
      fc.property(targetPathArb, fc.uint8Array({ minLength: 8, maxLength: 8 }), (target, bytes) => {
        expect(dirname(atomicWriteTempPath(target, fixedBytes(bytes)))).toBe(dirname(target));
      }),
    );
  });
});

describe("atomicWriteTempPath uniqueness suffix", () => {
  it("derives the suffix from the injected random bytes, identically across repeated calls", () => {
    fc.assert(
      fc.property(targetPathArb, fc.uint8Array({ minLength: 8, maxLength: 8 }), (target, bytes) => {
        const source = fixedBytes(bytes);
        const temp = atomicWriteTempPath(target, source);
        expect(atomicWriteTempPath(target, source)).toBe(temp);
        expect(temp).toContain(Buffer.from(bytes).toString("hex"));
      }),
    );
  });

  it("yields distinct temp paths for distinct random bytes", () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 8, maxLength: 8 }),
        fc.uint8Array({ minLength: 8, maxLength: 8 }),
        (a, b) => {
          fc.pre(Buffer.from(a).toString("hex") !== Buffer.from(b).toString("hex"));
          const target = "/var/data/settings.json";
          expect(atomicWriteTempPath(target, fixedBytes(a))).not.toBe(
            atomicWriteTempPath(target, fixedBytes(b)),
          );
        },
      ),
    );
  });
});
