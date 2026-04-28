import { existsSync } from "node:fs";

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { withTestEnv } from "@/spec/testing/index";
import type { Config } from "@/spec/testing/index";

const MINIMAL_CONFIG: Config = {
  specTree: {
    kinds: {
      enabler: { category: "node", suffix: ".enabler" },
      outcome: { category: "node", suffix: ".outcome" },
      adr: { category: "decision", suffix: ".adr.md" },
      pdr: { category: "decision", suffix: ".pdr.md" },
    },
  },
};

describe("withTestEnv — concurrent isolation", () => {
  it("gives every concurrent invocation a distinct temp directory and isolates writes across any cardinality of parallel runs", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(
          fc.string({ minLength: 1, maxLength: 12 }).filter((s) => !/[/\0]/.test(s)),
          { minLength: 2, maxLength: 8 },
        ),
        async (markers) => {
          const observations = await Promise.all(
            markers.map(async (marker): Promise<{ dir: string; readBack: string }> => {
              let dir = "";
              let readBack = "";
              await withTestEnv(MINIMAL_CONFIG, async (env) => {
                dir = env.projectDir;
                await env.writeRaw("marker.txt", marker);
                readBack = await env.readFile("marker.txt");
              });
              return { dir, readBack };
            }),
          );

          const directories = observations.map((o) => o.dir);
          expect(new Set(directories).size).toBe(directories.length);

          observations.forEach(({ readBack }, index) => {
            expect(readBack).toBe(markers[index]);
          });

          for (const dir of directories) {
            expect(existsSync(dir)).toBe(false);
          }
        },
      ),
      { numRuns: 5 },
    );
  });
});
