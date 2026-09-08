import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { METHODOLOGY_TREE_ROOT, PLUGINS_REPOSITORY, runMethodologyFetch } from "@/lib/methodology";
import { arbitraryMethodologyVersion, arbitraryPluginsContent } from "@testing/generators/methodology/tree";
import { readDirectoryTree, withPluginsRepository } from "@testing/harnesses/methodology/plugins-repository";
import {
  assertProperty,
  PROPERTY_LEVEL,
  PROPERTY_RUN_COUNTS,
  PROPERTY_SIZE,
  PROPERTY_TIMEOUTS_MS,
} from "@testing/harnesses/property/property";

describe("methodology fetch determinism", () => {
  it("produces byte-identical line content and source record for the same revision and line", async () => {
    await assertProperty(
      arbitraryMethodologyVersion().chain((version) => arbitraryPluginsContent(version.text)),
      async (content) => {
        await withPluginsRepository(content, async (repository) => {
          const fetchOnce = async (): Promise<ReadonlyMap<string, string>> => {
            const outcome = await runMethodologyFetch({
              repository: PLUGINS_REPOSITORY,
              repositoryUrl: repository.repositoryDir,
              revision: repository.revision,
              packageRoot: repository.packageRoot,
              dependencies: repository.dependencies,
            });
            expect(outcome.ok).toBe(true);
            return readDirectoryTree(join(repository.packageRoot, METHODOLOGY_TREE_ROOT));
          };
          const first = await fetchOnce();
          const second = await fetchOnce();
          expect(first.size).toBeGreaterThan(0);
          expect([...second]).toEqual([...first]);
        });
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  }, PROPERTY_RUN_COUNTS[PROPERTY_SIZE.SMALL] * PROPERTY_TIMEOUTS_MS[PROPERTY_LEVEL.L1]);
});
