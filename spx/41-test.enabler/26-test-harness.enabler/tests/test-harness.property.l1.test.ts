import { sep } from "node:path/posix";

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { pythonTestingLanguage } from "@/test/languages/python";
import { typescriptTestingLanguage } from "@/test/languages/typescript";
import { TEST_DISPATCH_GENERATOR } from "@testing/generators/testing/dispatch";

function isPathPrefix(prefix: string, path: string): boolean {
  return path === prefix || path.startsWith(`${prefix}${sep}`);
}

describe("dispatch generator node paths", () => {
  it("yields two distinct node paths where neither is a path-prefix of the other", () => {
    fc.assert(
      fc.property(TEST_DISPATCH_GENERATOR.distinctNodePaths(), ([first, second]) => {
        expect(first).not.toBe(second);
        expect(isPathPrefix(first, second)).toBe(false);
        expect(isPathPrefix(second, first)).toBe(false);
      }),
    );
  });
});

describe("dispatch generator co-located files", () => {
  it("yields a descriptor-matching test file and a non-matching support file under a node", () => {
    for (const descriptor of [typescriptTestingLanguage, pythonTestingLanguage]) {
      fc.assert(
        fc.property(
          TEST_DISPATCH_GENERATOR.nodePath().chain((nodePath) =>
            fc.tuple(
              TEST_DISPATCH_GENERATOR.testFileUnder(descriptor, nodePath),
              TEST_DISPATCH_GENERATOR.supportFileUnder(descriptor, nodePath),
            )
          ),
          ([testFile, supportFile]) => {
            expect(descriptor.matchesTestFile(testFile)).toBe(true);
            expect(descriptor.matchesTestFile(supportFile)).toBe(false);
          },
        ),
      );
    }
  });
});
